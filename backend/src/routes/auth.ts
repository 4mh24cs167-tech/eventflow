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
      .select('*')
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

    res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email } });
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

export default router;
