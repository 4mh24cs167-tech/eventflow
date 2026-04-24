import { Router } from 'express';
import { supabase } from '../utils/supabase';
import { sendOtpEmail } from '../utils/mailer';

const router = Router();

const handleError = (res: any, err: any) => {
    console.error('Public route error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
};

// ========== IN-MEMORY OTP STORE ==========
// Key: `${hash}:${email}` → { otp, expiresAt }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanupExpiredOtps() {
    const now = Date.now();
    for (const [key, val] of otpStore.entries()) {
        if (val.expiresAt < now) otpStore.delete(key);
    }
}

// Verified emails set: `${hash}:${email}` — tracks which emails have been verified
const verifiedEmails = new Set<string>();

// GET /public/upcoming-events
// Returns upcoming HOD-approved events for the login page scroller
router.get('/upcoming-events', async (req, res: any) => {
    try {
        const { data, error } = await supabase
            .from('events')
            .select('id, title, date, venue, status, departments(name), categories(name)')
            .eq('status', 'APPROVED')
            .gte('date', new Date().toISOString().split('T')[0])
            .order('date', { ascending: true })
            .limit(30);
        if (error) throw error;
        // Deduplicate by event ID
        const seen = new Set<string>();
        const events = (data || []).reduce((acc: any[], e: any) => {
            if (!seen.has(e.id)) {
                seen.add(e.id);
                acc.push({
                    title: e.title,
                    date: e.date,
                    venue: e.venue,
                    department: e.departments?.name || 'Unknown Dept',
                    category: e.categories?.name || '',
                });
            }
            return acc;
        }, []);
        res.json(events);
    } catch (err) { handleError(res, err); }
});

// GET /public/forms/:hash
// Fetch form configuration for a specific Hash (Registration or Feedback)
router.get('/forms/:hash', async (req, res: any) => {
    const { hash } = req.params;
    try {
        const { data: form, error } = await supabase
            .from('form_configs')
            .select('*, events(title, date, venue)')
            .eq('link_hash', hash)
            .single();

        if (error || !form) {
            return res.status(404).json({ error: 'Form not found or has been removed.' });
        }
        
        if (!form.is_active) {
            return res.status(403).json({ error: 'This form is currently closed.' });
        }

        res.json({
            type: form.type,
            fields: form.fields,
            event: form.events
        });
    } catch (err) { handleError(res, err); }
});

// POST /public/forms/:hash/send-otp
// Send an OTP to the given email address for verification
router.post('/forms/:hash/send-otp', async (req, res: any) => {
    const { hash } = req.params;
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: 'Email is required.' });

    try {
        // Verify form exists and is active
        const { data: form, error } = await supabase
            .from('form_configs')
            .select('id, event_id, type, is_active, events(title)')
            .eq('link_hash', hash)
            .single();

        if (error || !form) return res.status(404).json({ error: 'Form not found.' });
        if (!form.is_active) return res.status(403).json({ error: 'This form is currently closed.' });

        // Check if already registered (for registration forms)
        if (form.type === 'REGISTRATION') {
            const { data: existing } = await supabase
                .from('participants')
                .select('id')
                .eq('event_id', form.event_id)
                .eq('email', email)
                .maybeSingle();

            if (existing) {
                return res.status(400).json({ error: 'You are already registered for this event.' });
            }
        }

        // Clean up expired OTPs periodically
        cleanupExpiredOtps();

        // Rate limit: don't allow sending another OTP within 60 seconds
        const storeKey = `${hash}:${email}`;
        const existingOtp = otpStore.get(storeKey);
        if (existingOtp && existingOtp.expiresAt - 4 * 60 * 1000 > Date.now()) {
            // Less than 1 minute since last OTP
            return res.status(429).json({ error: 'Please wait 60 seconds before requesting another OTP.' });
        }

        const otp = generateOtp();
        otpStore.set(storeKey, { otp, expiresAt: Date.now() + 5 * 60 * 1000 }); // 5 min TTL

        // Send OTP email (fire-and-forget with logging)
        const eventTitle = (form as any).events?.title || 'Event';
        sendOtpEmail({ recipientEmail: email, otp, eventTitle })
            .then(() => console.log(`[OTP] Sent to ${email} for form ${hash}`))
            .catch(err => console.error(`[OTP] Failed to send to ${email}:`, err));

        res.json({ message: 'OTP sent to your email address.' });
    } catch (err) { handleError(res, err); }
});

// POST /public/forms/:hash/verify-otp
// Verify the OTP code for the given email
router.post('/forms/:hash/verify-otp', async (req, res: any) => {
    const { hash } = req.params;
    const { email, otp } = req.body;

    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });

    const storeKey = `${hash}:${email}`;
    const stored = otpStore.get(storeKey);

    if (!stored) {
        return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
    }

    if (stored.expiresAt < Date.now()) {
        otpStore.delete(storeKey);
        return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (stored.otp !== otp) {
        return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

    // Mark email as verified
    otpStore.delete(storeKey);
    verifiedEmails.add(storeKey);

    // Auto-expire verified status after 15 minutes
    setTimeout(() => verifiedEmails.delete(storeKey), 15 * 60 * 1000);

    res.json({ message: 'Email verified successfully!' });
});

// POST /public/forms/:hash/submit
// Submit registration or feedback data
router.post('/forms/:hash/submit', async (req, res: any) => {
    const { hash } = req.params;
    const body = req.body; // Form submission data

    try {
        const { data: form, error } = await supabase
            .from('form_configs')
            .select('id, event_id, type, is_active')
            .eq('link_hash', hash)
            .single();

        if (error || !form) return res.status(404).json({ error: 'Form not found.' });
        if (!form.is_active) return res.status(403).json({ error: 'This form is currently closed.' });

        const eventId = form.event_id;

        if (form.type === 'REGISTRATION') {
            const email = body.email;
            if (!email) return res.status(400).json({ error: 'Email is required for registration.' });

            // Verify OTP was completed
            const storeKey = `${hash}:${email}`;
            if (!verifiedEmails.has(storeKey)) {
                return res.status(403).json({ error: 'Email not verified. Please complete OTP verification first.' });
            }

            // Check if already registered
            const { data: existing } = await supabase
                .from('participants')
                .select('id')
                .eq('event_id', eventId)
                .eq('email', email)
                .maybeSingle();

            if (existing) {
                return res.status(400).json({ error: 'You are already registered for this event.' });
            }

            // Map standard fields, throw rest into custom_data
            const { name, phone, department, year, ...custom_data } = body;
            
            const { error: insertErr } = await supabase.from('participants').insert([{
                event_id: eventId,
                name: name || 'Unknown',
                email: email,
                phone: phone || null,
                department: department || null,
                year: year || null,
                custom_data: custom_data
            }]);
            
            if (insertErr) throw insertErr;

            // Clean up verification
            verifiedEmails.delete(storeKey);

            res.json({ message: 'Registration successful!' });

        } else if (form.type === 'FEEDBACK') {
            const email = body.email;
            if (!email) return res.status(400).json({ error: 'Email is required' });

            const rating = parseInt(body.rating) || 0;
            if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Valid rating (1-5) is required.' });

            // Check if this email is a registered participant
            const { data: participant } = await supabase
                .from('participants')
                .select('id')
                .eq('event_id', eventId)
                .eq('email', email)
                .maybeSingle();

            if (!participant) {
                return res.status(403).json({ error: 'Only registered participants can submit feedback. This email was not found in the registration list.' });
            }

            // Check if already submitted feedback
            const { data: existing } = await supabase
                .from('feedbacks')
                .select('id')
                .eq('event_id', eventId)
                .eq('email', email)
                .maybeSingle();

            if (existing) {
                return res.status(400).json({ error: 'You have already submitted feedback for this event.' });
            }

            const { quality, suggestions, ...custom_data } = body;
            // Remove rating/email from custom_data
            delete custom_data.rating;
            delete custom_data.email;

            const { error: fErr } = await supabase.from('feedbacks').insert([{
                event_id: eventId,
                email: email,
                rating: rating,
                quality: quality || null,
                suggestions: suggestions || null,
                custom_data: custom_data
            }]);
            
            if (fErr) throw fErr;
            res.json({ message: 'Thank you for your feedback!' });
        } else {
            res.status(400).json({ error: 'Unknown form type' });
        }
    } catch (err) { handleError(res, err); }
});

export default router;
