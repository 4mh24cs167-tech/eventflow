import { Router } from 'express';
import { supabase } from '../utils/supabase';

const router = Router();

const handleError = (res: any, err: any) => {
    console.error('Public route error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
};

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
            res.json({ message: 'Registration successful!' });

        } else if (form.type === 'FEEDBACK') {
            const email = body.email;
            if (!email) return res.status(400).json({ error: 'Email is required' });

            const rating = parseInt(body.rating) || 0;
            if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Valid rating (1-5) is required.' });

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
