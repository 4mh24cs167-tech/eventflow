import { Router } from 'express';
import { supabase } from '../utils/supabase';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest } from '../middlewares/authMiddleware';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*, theme_preference')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Auto-resolve department_id for HOD users if missing
    let departmentId = user.department_id;
    if (user.role === 'HOD' && !departmentId) {
      const { data: dept } = await supabase
        .from('departments')
        .select('id')
        .eq('hod_id', user.id)
        .single();
      if (dept) {
        departmentId = dept.id;
        // Fix the user record for future logins
        await supabase.from('users').update({ department_id: dept.id }).eq('id', user.id);
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, departmentId },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email, theme_preference: user.theme_preference || 'dark' } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// A helper route to create the first Admin/Principal if none exists, just for testing
router.post('/setup-root', async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
     const hashedPassword = await bcrypt.hash(password, 10);
     const { data, error } = await supabase.from('users').insert([{
         name, email, password: hashedPassword, role
     }]).select();
     if (error) return res.status(400).json({error: error.message});
     res.json({ message: "Root user created", data});
  } catch(e: any) {
      res.status(500).json({error: e.message});
  }
});

// Change password (authenticated)
router.post('/change-password', authenticateToken, async (req: AuthRequest, res: any) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  try {
    const { data: user, error } = await supabase.from('users').select('password').eq('id', userId).single();
    if (error || !user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    const { error: updateErr } = await supabase.from('users').update({ password: hashed }).eq('id', userId);
    if (updateErr) throw updateErr;

    res.json({ message: 'Password changed successfully' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Save theme preference (authenticated)
router.post('/theme', authenticateToken, async (req: AuthRequest, res: any) => {
  const { theme } = req.body;
  const userId = req.user.id;

  if (!theme || !['light', 'dark'].includes(theme)) {
    return res.status(400).json({ error: 'Invalid theme. Must be "light" or "dark".' });
  }

  try {
    const { error } = await supabase.from('users').update({ theme_preference: theme }).eq('id', userId);
    if (error) throw error;
    res.json({ message: 'Theme updated', theme });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ========== FORGOT PASSWORD (OTP-based) ==========
const resetOtpStore = new Map<string, { otp: string; expiresAt: number }>();

// Step 1: Send OTP to email
router.post('/forgot-password', async (req, res: any) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const { data: user, error } = await supabase.from('users').select('id, name, email').eq('email', email).single();
    if (error || !user) return res.status(404).json({ error: 'No account found with this email address' });

    // Rate limit
    const existing = resetOtpStore.get(email);
    if (existing && existing.expiresAt - 4 * 60 * 1000 > Date.now()) {
      return res.status(429).json({ error: 'Please wait 60 seconds before requesting another OTP' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    resetOtpStore.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    const { sendBrevoEmail } = await import('../utils/mailer');
    await sendBrevoEmail({
      to: [{ email: user.email, name: user.name }],
      subject: 'Event Flow — Password Reset OTP',
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <h2 style="color:#4f46e5;">Password Reset</h2>
          <p>Hi <strong>${user.name}</strong>,</p>
          <p>Use this OTP to reset your password. It expires in 5 minutes.</p>
          <div style="background:#f1f5f9;padding:16px;border-radius:8px;text-align:center;margin:20px 0;">
            <code style="font-size:2rem;font-weight:bold;color:#1e293b;letter-spacing:6px;">${otp}</code>
          </div>
          <p style="color:#64748b;font-size:0.85rem;">If you didn't request this, ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
          <p style="color:#94a3b8;font-size:0.75rem;">Event Flow — Academic Event Management</p>
        </div>
      `,
    });

    res.json({ message: 'OTP sent to your email address' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Step 2: Verify OTP and set new password
router.post('/reset-password', async (req, res: any) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return res.status(400).json({ error: 'Email, OTP, and new password are required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const stored = resetOtpStore.get(email);
    if (!stored) return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
    if (Date.now() > stored.expiresAt) {
      resetOtpStore.delete(email);
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }
    if (stored.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

    // OTP valid — update password
    resetOtpStore.delete(email);
    const hashed = await bcrypt.hash(newPassword, 10);
    const { error } = await supabase.from('users').update({ password: hashed }).eq('email', email);
    if (error) throw error;

    res.json({ message: 'Password reset successfully! You can now log in.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
