import { Router } from 'express';
import { supabase } from '../utils/supabase';
import { authenticateToken, requireRole, AuthRequest } from '../middlewares/authMiddleware';
import { computeEnrichedSchedules } from '../utils/statusComputer';
import multer from 'multer';

const router = Router();

// Use memory storage — works on Vercel serverless (no writable disk needed)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticateToken);
router.use(requireRole(['ADMIN']));

const handleError = (res: any, err: any) => {
    console.error('Admin route error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
};

// ========== DASHBOARD ==========
router.get('/dashboard', async (req: AuthRequest, res: any) => {
    const adminId = req.user.id;
    const { year, date_from, date_to } = req.query as { year?: string; date_from?: string; date_to?: string };

    try {
        let query = supabase.from('events').select('id, status').eq('admin_id', adminId);
        if (date_from) query = (query as any).gte('date', date_from);
        if (date_to) query = (query as any).lte('date', date_to);
        if (!date_from && !date_to && year) {
            if (String(year).includes('-')) {
                const [ys, ye] = String(year).split('-');
                query = (query as any).gte('date', `${ys}-09-01`).lte('date', `${ye}-08-31`);
            } else {
                query = (query as any).gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
            }
        }
        
        const { data: evs, error } = await query;
        if (error) throw error;

        const summary = {
            totalEvents: evs.length,
            draft: evs.filter(e => e.status === 'DRAFT').length,
            pending: evs.filter(e => e.status === 'PENDING_APPROVAL').length,
            approved: evs.filter(e => e.status === 'APPROVED').length,
            completed: evs.filter(e => e.status === 'COMPLETED').length,
            rejected: evs.filter(e => e.status === 'REJECTED').length
        };

        res.json(summary);
    } catch (err) { handleError(res, err); }
});

// ========== EVENTS MANAGEMENT ==========
router.get('/events', async (req: AuthRequest, res: any) => {
    const adminId = req.user.id;
    const { status, year, date_from, date_to } = req.query as any;

    try {
        let query = supabase.from('events').select('*, categories(name), subcategories(name)').eq('admin_id', adminId);
        if (status) query = query.eq('status', status);
        if (date_from) query = (query as any).gte('date', date_from);
        if (date_to) query = (query as any).lte('date', date_to);
        if (!date_from && !date_to && year) {
            if (String(year).includes('-')) {
                const [ys, ye] = String(year).split('-');
                query = (query as any).gte('date', `${ys}-09-01`).lte('date', `${ye}-08-31`);
            } else {
                query = (query as any).gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
            }
        }
        query = query.order('date', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

router.get('/events/:id', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const adminId = req.user.id;

    try {
        const { data: event, error } = await supabase
            .from('events')
            .select('*, categories(name), subcategories(name), departments(name)')
            .eq('id', id)
            .eq('admin_id', adminId)
            .single();

        if (error || !event) return res.status(404).json({ error: 'Event not found' });

        const { data: formConfigs } = await supabase.from('form_configs').select('*').eq('event_id', id);
        const { data: media } = await supabase.from('media').select('*').eq('event_id', id);
        const { count: pCount } = await supabase.from('participants').select('id', { count: 'exact', head: true }).eq('event_id', id);
        const { count: fCount } = await supabase.from('feedbacks').select('id', { count: 'exact', head: true }).eq('event_id', id);

        res.json({
            ...event,
            forms: formConfigs || [],
            media: media || [],
            participantCount: pCount || 0,
            feedbackCount: fCount || 0
        });
    } catch (err) { handleError(res, err); }
});

// Create Event (DRAFT)
router.post('/events', async (req: AuthRequest, res: any) => {
    const { title, date, venue, guests, target_count, category_id, subcategory_id } = req.body;
    const user = req.user;
    
    try {
        const { data, error } = await supabase.from('events').insert([{
            title, date, venue, guests, target_count, category_id, subcategory_id, 
            department_id: user.departmentId, 
            admin_id: user.id,
            status: 'DRAFT'
        }]).select();
        if (error) throw error;
        res.json({ message: 'Draft event created', data });
    } catch (err) { handleError(res, err); }
});

// Update Event (Allowed only if DRAFT or REJECTED or APPROVED)
router.put('/events/:id', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const adminId = req.user.id;
    const updates = req.body;
    try {
        const { data: ev } = await supabase.from('events').select('status').eq('id', id).eq('admin_id', adminId).single();
        if (!ev) return res.status(404).json({ error: 'Event not found' });
        if (ev.status === 'COMPLETED') return res.status(400).json({ error: 'Cannot edit a completed event.' });

        const { data, error } = await supabase.from('events').update(updates).eq('id', id).select();
        if (error) throw error;
        res.json({ message: 'Event updated', data });
    } catch (err) { handleError(res, err); }
});

// Delete Draft / Rejected Event
router.delete('/events/:id', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const adminId = req.user.id;
    try {
        const { data: ev } = await supabase.from('events').select('status').eq('id', id).eq('admin_id', adminId).single();
        if (!ev) return res.status(404).json({ error: 'Event not found' });
        
        if (ev.status !== 'DRAFT' && ev.status !== 'REJECTED') {
            return res.status(400).json({ error: `Cannot delete events in ${ev.status} status.` });
        }

        const { error } = await supabase.from('events').delete().eq('id', id).eq('admin_id', adminId);
        if (error) throw error;
        res.json({ message: 'Draft event removed successfully' });
    } catch (err) { handleError(res, err); }
});

// Transition: Submit for Approval
router.post('/events/:id/submit-approval', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const adminId = req.user.id;
    try {
        const { data, error } = await supabase
            .from('events').update({ status: 'PENDING_APPROVAL', updated_at: new Date().toISOString() })
            .eq('id', id).eq('admin_id', adminId).select();
        if (error) throw error;
        res.json({ message: 'Event submitted to HOD for approval', data });
    } catch (err) { handleError(res, err); }
});

// Transition: Send to Verification/Completed
router.post('/events/:id/mark-completed', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const adminId = req.user.id;
    try {
        const { data, error } = await supabase
            .from('events').update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
            .eq('id', id).eq('admin_id', adminId).select();
        if (error) throw error;

        // Auto-close registration forms when event is completed
        await supabase
            .from('form_configs')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('event_id', id)
            .eq('type', 'REGISTRATION');

        res.json({ message: 'Event marked as Completed and sent for HOD Verification', data });
    } catch (err) { handleError(res, err); }
});

// ========== FORM BUILDER ==========
router.post('/events/:id/forms', async (req: AuthRequest, res: any) => {
    const { id: event_id } = req.params;
    const adminId = req.user.id;
    const { type, fields, is_active } = req.body; // type: REGISTRATION or FEEDBACK
    
    try {
        // Check ownership
        const { data: ev } = await supabase.from('events').select('id').eq('id', event_id).eq('admin_id', adminId).single();
        if (!ev) return res.status(403).json({ error: 'Unauthorized' });

        const { data: existing } = await supabase.from('form_configs').select('id').eq('event_id', event_id).eq('type', type).maybeSingle();

        if (existing) {
            const { data, error } = await supabase.from('form_configs')
                .update({ fields, is_active, updated_at: new Date().toISOString() })
                .eq('id', existing.id).select();
            if (error) throw error;
            res.json({ message: `${type} form updated`, data });
        } else {
            const link_hash = Math.random().toString(36).substring(2, 10);
            const { data, error } = await supabase.from('form_configs')
                .insert([{ event_id, type, fields, is_active, link_hash }]).select();
            if (error) throw error;
            res.json({ message: `${type} form created`, data });
        }
    } catch (err) { handleError(res, err); }
});

// ========== MEDIA UPLOAD (URL-only, works on Vercel) ==========
router.post('/events/:id/media-url', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const { type, url } = req.body;
    if (!url || !type) return res.status(400).json({ error: 'Type and URL are required.' });
    try {
        const urls = url.split(',').map((u: string) => u.trim()).filter((u: string) => u !== '');
        const inserts = urls.map((attachUrl: string) => ({ event_id: id, type, url: attachUrl }));
        if (inserts.length === 0) return res.status(400).json({ error: 'No valid URLs provided.' });
        const { data, error } = await supabase.from('media').insert(inserts).select();
        if (error) throw error;
        res.json({ message: `Successfully attached ${inserts.length} media item(s)`, data });
    } catch (err) { handleError(res, err); }
});

// ========== MEDIA UPLOAD (File upload via Supabase Storage) ==========
router.post('/events/:id/media', upload.array('files', 15), async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const { type } = req.body;
    let urlString = req.body.url;

    try {
        let inserts: any[] = [];
        const files = req.files as Express.Multer.File[];

        if (files && files.length > 0) {
            for (const file of files) {
                const ext = file.originalname.split('.').pop() || 'bin';
                const fileName = `${id}/${Date.now()}-${Math.round(Math.random() * 1E9)}.${ext}`;

                const { data: uploadData, error: uploadErr } = await supabase.storage
                    .from('event-media')
                    .upload(fileName, file.buffer, {
                        contentType: file.mimetype,
                        upsert: false,
                    });

                if (uploadErr) {
                    console.error('Supabase Storage upload error:', uploadErr);
                    throw new Error(`Failed to upload ${file.originalname}: ${uploadErr.message}`);
                }

                const { data: urlData } = supabase.storage
                    .from('event-media')
                    .getPublicUrl(fileName);

                inserts.push({ event_id: id, type, url: urlData.publicUrl });
            }
        }

        if (urlString && typeof urlString === 'string') {
            const urls = urlString.split(',').map((u: string) => u.trim()).filter((u: string) => u !== '');
            for (const attachUrl of urls) {
                inserts.push({ event_id: id, type, url: attachUrl });
            }
        }

        if (inserts.length === 0) {
            return res.status(400).json({ error: 'Please provide at least one file or URL.' });
        }

        const { data, error } = await supabase.from('media').insert(inserts).select();
        if (error) throw error;
        res.json({ message: `Successfully attached ${inserts.length} media item(s)`, data });
    } catch (err) { handleError(res, err); }
});

// ========== DELETE MEDIA ==========
router.delete('/media/:mediaId', async (req: AuthRequest, res: any) => {
    const { mediaId } = req.params;
    try {
        const { data: media, error: findErr } = await supabase.from('media').select('*').eq('id', mediaId).single();
        if (findErr || !media) return res.status(404).json({ error: 'Media not found' });

        // Try deleting from Supabase Storage if it's a storage URL
        if (media.url && media.url.includes('supabase') && media.url.includes('event-media')) {
            try {
                const storagePath = media.url.split('/event-media/')[1];
                if (storagePath) {
                    await supabase.storage.from('event-media').remove([storagePath]);
                }
            } catch (e) { console.warn('Storage delete failed (non-critical):', e); }
        }

        const { error } = await supabase.from('media').delete().eq('id', mediaId);
        if (error) throw error;
        res.json({ message: 'Media deleted' });
    } catch (err) { handleError(res, err); }
});

// ========== PARTICIPANT MANAGEMENT (EXECUTION) ==========
router.get('/events/:id/participants', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const adminId = req.user.id;
    try {
        const { data: ev } = await supabase.from('events').select('id').eq('id', id).eq('admin_id', adminId).single();
        if (!ev) return res.status(403).json({ error: 'Unauthorized' });

        const { data, error } = await supabase.from('participants').select('*').eq('event_id', id).order('created_at', { ascending: false });
        if (error) throw error;

        // Map custom_data.attendance if we are using JSONB to track it, else use a dedicated field.
        // We'll use custom_data->>'attendance' to toggle
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

router.put('/participants/:pid/attendance', async (req: AuthRequest, res: any) => {
    const { pid } = req.params;
    const { present } = req.body; // boolean
    try {
        // Fetch participant
        const { data: part } = await supabase.from('participants').select('custom_data, event_id').eq('id', pid).single();
        if (!part) return res.status(404).json({ error: 'Participant not found' });

        const custom_data = part.custom_data || {};
        custom_data.attendance = present;

        const { data, error } = await supabase.from('participants').update({ custom_data }).eq('id', pid).select();
        if (error) throw error;
        res.json({ message: 'Attendance updated', data });
    } catch (err) { handleError(res, err); }
});

router.get('/events/:id/feedbacks', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const adminId = req.user.id;
    try {
        const { data: ev } = await supabase.from('events').select('id').eq('id', id).eq('admin_id', adminId).single();
        if (!ev) return res.status(403).json({ error: 'Unauthorized' });

        const { data, error } = await supabase.from('feedbacks').select('*').eq('event_id', id).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

// ========== AI FEEDBACK EVALUATION ==========
router.post('/events/:id/ai-evaluate', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const adminId = req.user.id;
    try {
        // Verify ownership
        const { data: ev } = await supabase.from('events').select('id, title, target_count').eq('id', id).eq('admin_id', adminId).single();
        if (!ev) return res.status(403).json({ error: 'Unauthorized' });

        // Get feedbacks
        const { data: feedbacks } = await supabase.from('feedbacks').select('rating, quality, suggestions').eq('event_id', id);
        if (!feedbacks || feedbacks.length === 0) {
            return res.status(400).json({ error: 'No feedback data available for AI evaluation. At least one feedback submission is required.' });
        }

        // Get participant count
        const { count: participantCount } = await supabase.from('participants').select('id', { count: 'exact', head: true }).eq('event_id', id);

        const avgRating = feedbacks.reduce((s: number, f: any) => s + f.rating, 0) / feedbacks.length;
        const ratingDist = [1,2,3,4,5].map(r => ({ rating: r, count: feedbacks.filter((f: any) => f.rating === r).length }));

        // Build fallback result
        let aiResult: any = {
            overall_rating: Math.round(avgRating * 10) / 10,
            summary: `Event "${ev.title}" received ${feedbacks.length} feedback responses with an average rating of ${avgRating.toFixed(1)}/5. ${participantCount || 0} participants registered against a target of ${ev.target_count || 'N/A'}.`,
            strengths: feedbacks.filter((f: any) => f.quality).map((f: any) => f.quality).filter(Boolean).slice(0, 5).join('; ') || 'No specific strengths mentioned.',
            improvements: feedbacks.filter((f: any) => f.suggestions).map((f: any) => f.suggestions).filter(Boolean).slice(0, 5).join('; ') || 'No specific improvements suggested.',
            insights: `Rating distribution: ${ratingDist.map(r => `${r.rating}★: ${r.count}`).join(', ')}. Participation rate: ${ev.target_count ? Math.round(((participantCount || 0) / ev.target_count) * 100) : 'N/A'}%.`
        };

        // Use Gemini if API key is available
        if (process.env.AI_API_KEY) {
            try {
                const { GoogleGenerativeAI } = require('@google/generative-ai');
                const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const prompt = `You are an educational event quality analyst. Analyze this college event feedback data and provide a professional evaluation.

Event: "${ev.title}"
Target Participants: ${ev.target_count || 'Not set'}
Actual Participants: ${participantCount || 0}
Total Feedbacks: ${feedbacks.length}
Average Rating: ${avgRating.toFixed(1)}/5

Feedback Data:
${feedbacks.map((f: any, i: number) => `[${i+1}] Rating: ${f.rating}/5 | Liked: "${f.quality || 'N/A'}" | Suggestions: "${f.suggestions || 'N/A'}"`).join('\n')}

Return ONLY a valid JSON object (no markdown, no code blocks) with these exact keys:
"overall_rating": (number 1-5 with one decimal),
"summary": (2-3 sentence professional performance summary),
"strengths": (3-5 bullet points of what went well, separated by newlines),
"improvements": (3-5 bullet points of actionable improvements, separated by newlines),
"insights": (2-3 sentences about participation trends, engagement patterns, and recommendations for future events)`;

                const result = await model.generateContent(prompt);
                const responseText = result.response.text();
                const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleaned);
                aiResult = { ...aiResult, ...parsed };
            } catch (aiErr) {
                console.warn('AI evaluation failed, using statistical fallback:', aiErr);
            }
        }

        res.json(aiResult);
    } catch (err) { handleError(res, err); }
});

// ========== PUBLIC / META REQS FOR ADMIN ==========
router.get('/categories', async (req: AuthRequest, res: any) => {
    const adminId = req.user.id;
    try {
        const { data: dept } = await supabase.from('users').select('department_id').eq('id', adminId).single();
        
        let query = supabase.from('categories').select('*, subcategories(*)');
        if (dept?.department_id) {
            query = query.eq('department_id', dept.department_id);
        }
            
        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

// ========== HOD SCHEDULES (view only for admin) ==========

router.get('/schedules', async (req: AuthRequest, res: any) => {
    const adminId = req.user.id;
    const { academic_year } = req.query as any;

    try {
        const { data: user } = await supabase.from('users').select('department_id').eq('id', adminId).single();
        if (!user?.department_id) return res.json([]);

        const deptId = user.department_id;

        let query = supabase
            .from('category_schedules')
            .select('*, categories(name), subcategories(name)')
            .eq('department_id', deptId)
            .order('scheduled_year', { ascending: true })
            .order('scheduled_month', { ascending: true });

        if (academic_year) query = query.eq('academic_year', academic_year);

        const { data: schedules, error } = await query;
        if (error) throw error;
        
        if (!schedules || schedules.length === 0) return res.json([]);

        // Fetch all completed events for this department logic to map chronologically
        const { data: completedEvents } = await supabase
            .from('events')
            .select('id, date, category_id, subcategory_id')
            .eq('department_id', deptId)
            .eq('status', 'COMPLETED');

        const enriched = computeEnrichedSchedules(schedules, completedEvents || []);
        res.json(enriched);
    } catch (err) { handleError(res, err); }
});

export default router;

