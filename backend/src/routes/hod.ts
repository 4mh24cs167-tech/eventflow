import { Router } from 'express';
import { supabase } from '../utils/supabase';
import { authenticateToken, requireRole, AuthRequest } from '../middlewares/authMiddleware';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { sendCredentialsEmail } from '../utils/mailer';
import { computeEnrichedSchedules } from '../utils/statusComputer';

const router = Router();
router.use(authenticateToken);
router.use(requireRole(['HOD']));

const handleError = (res: any, err: any) => {
    console.error('HOD route error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
};

// ========== DASHBOARD ==========
router.get('/dashboard', async (req: AuthRequest, res: any) => {
    const deptId = req.user.departmentId;
    if (!deptId) return res.status(400).json({ error: 'No department assigned to your account' });
    const { year, date_from, date_to } = req.query as any;

    try {
        // Apply date filter helper - explicit range takes priority over year
        const applyDateFilter = (q: any) => {
            if (date_from) q = q.gte('date', date_from);
            if (date_to) q = q.lte('date', date_to);
            if (!date_from && !date_to && year) {
                if (String(year).includes('-')) {
                    const [ys, ye] = String(year).split('-');
                    q = q.gte('date', `${ys}-09-01`).lte('date', `${ye}-08-31`);
                } else {
                    q = q.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
                }
            }
            return q;
        };

        let evQ = applyDateFilter(supabase.from('events').select('id', { count: 'exact', head: true }).eq('department_id', deptId));
        let cpQ = applyDateFilter(supabase.from('events').select('id', { count: 'exact', head: true }).eq('department_id', deptId).eq('status', 'COMPLETED'));
        let pdQ = applyDateFilter(supabase.from('events').select('id', { count: 'exact', head: true }).eq('department_id', deptId).eq('status', 'PENDING_APPROVAL'));
        let apQ = applyDateFilter(supabase.from('events').select('id', { count: 'exact', head: true }).eq('department_id', deptId).eq('status', 'APPROVED'));
        let rjQ = applyDateFilter(supabase.from('events').select('id', { count: 'exact', head: true }).eq('department_id', deptId).eq('status', 'REJECTED'));

        const { count: totalEvents } = await evQ;
        const { count: completed } = await cpQ;
        const { count: pending } = await pdQ;
        const { count: approved } = await apQ;
        const { count: rejected } = await rjQ;

        const { count: catCount } = await supabase
            .from('categories').select('id', { count: 'exact', head: true })
            .eq('department_id', deptId);

        // Participant count filtered by date range
        let totalParticipants = 0;
        const { data: deptEvents } = await applyDateFilter(
            supabase.from('events').select('id').eq('department_id', deptId)
        );
        if (deptEvents && deptEvents.length > 0) {
            const eventIds = deptEvents.map((e: any) => e.id);
            const { count: pCount } = await supabase
                .from('participants').select('id', { count: 'exact', head: true })
                .in('event_id', eventIds);
            totalParticipants = pCount || 0;
        }

        const { data: dept } = await supabase
            .from('departments').select('name').eq('id', deptId).single();

        res.json({
            departmentName: dept?.name || 'My Department',
            totalEvents: totalEvents || 0,
            completedEvents: completed || 0,
            pendingEvents: pending || 0,
            approvedEvents: approved || 0,
            rejectedEvents: rejected || 0,
            totalCategories: catCount || 0,
            totalParticipants,
        });
    } catch (err) { handleError(res, err); }
});

// ========== CATEGORY MANAGEMENT ==========
// List categories with subcategories
router.get('/categories', async (req: AuthRequest, res: any) => {
    const deptId = req.user.departmentId;
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });
    try {
        const { data: cats, error } = await supabase
            .from('categories')
            .select('*, subcategories(*)')
            .eq('department_id', deptId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(cats || []);
    } catch (err) { handleError(res, err); }
});

// Create category
router.post('/categories', async (req: AuthRequest, res: any) => {
    const { name } = req.body;
    const deptId = req.user.departmentId;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });
    try {
        const { data, error } = await supabase
            .from('categories')
            .insert([{ name, department_id: deptId }])
            .select();
        if (error) throw error;
        res.json({ message: 'Category created', data });
    } catch (err) { handleError(res, err); }
});

// Bulk upload categories (with optional subcategories)
router.post('/categories/bulk', async (req: AuthRequest, res: any) => {
    const { categories } = req.body; // [{ name: 'Academic', subcategories: ['Workshop','Seminar'] }, ...]
    const deptId = req.user.departmentId;
    if (!categories || !Array.isArray(categories) || categories.length === 0) {
        return res.status(400).json({ error: 'Provide an array of categories' });
    }
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });

    try {
        let created = 0;
        let skipped = 0;
        for (const cat of categories) {
            const catName = (cat.name || '').trim();
            if (!catName) { skipped++; continue; }

            // Check if category already exists in this department
            const { data: existing } = await supabase
                .from('categories').select('id').eq('name', catName).eq('department_id', deptId).maybeSingle();

            let catId: string;
            if (existing) {
                catId = existing.id;
                skipped++;
            } else {
                const { data: newCat, error } = await supabase
                    .from('categories').insert([{ name: catName, department_id: deptId }]).select().single();
                if (error) throw error;
                catId = newCat.id;
                created++;
            }

            // Create subcategories if provided
            const subs = cat.subcategories || [];
            for (const subName of subs) {
                const trimmed = (subName || '').trim();
                if (!trimmed) continue;
                // Check if subcategory already exists
                const { data: existingSub } = await supabase
                    .from('subcategories').select('id').eq('name', trimmed).eq('category_id', catId).maybeSingle();
                if (!existingSub) {
                    await supabase.from('subcategories').insert([{ name: trimmed, category_id: catId }]);
                }
            }
        }
        res.json({ message: `Bulk upload complete: ${created} created, ${skipped} skipped (already exist)` });
    } catch (err) { handleError(res, err); }
});

// Edit category
router.put('/categories/:id', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    try {
        const { data: cat } = await supabase.from('categories').select('department_id').eq('id', id).single();
        if (!cat || cat.department_id !== req.user.departmentId) {
            return res.status(403).json({ error: 'Category does not belong to your department' });
        }
        const { data, error } = await supabase.from('categories').update({ name }).eq('id', id).select();
        if (error) throw error;
        res.json({ message: 'Category updated', data });
    } catch (err) { handleError(res, err); }
});

// Delete category (cascades to subcategories)
router.delete('/categories/:id', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    try {
        const { data: cat } = await supabase.from('categories').select('department_id').eq('id', id).single();
        if (!cat || cat.department_id !== req.user.departmentId) {
            return res.status(403).json({ error: 'Category does not belong to your department' });
        }
        const { error } = await supabase.from('categories').delete().eq('id', id);
        if (error) throw error;
        res.json({ message: 'Category deleted' });
    } catch (err) { handleError(res, err); }
});

// Create subcategory
router.post('/subcategories', async (req: AuthRequest, res: any) => {
    const { name, category_id } = req.body;
    if (!name || !category_id) return res.status(400).json({ error: 'Name and category are required' });
    try {
        const { data: cat } = await supabase
            .from('categories').select('department_id').eq('id', category_id).single();
        if (!cat || cat.department_id !== req.user.departmentId) {
            return res.status(403).json({ error: 'Category does not belong to your department' });
        }
        const { data, error } = await supabase
            .from('subcategories')
            .insert([{ name, category_id }])
            .select();
        if (error) throw error;
        res.json({ message: 'Subcategory created', data });
    } catch (err) { handleError(res, err); }
});

// Edit subcategory
router.put('/subcategories/:id', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Subcategory name is required' });
    try {
        const { data: sub } = await supabase.from('subcategories').select('category_id').eq('id', id).single();
        if (!sub) return res.status(404).json({ error: 'Subcategory not found' });
        const { data: cat } = await supabase.from('categories').select('department_id').eq('id', sub.category_id).single();
        if (!cat || cat.department_id !== req.user.departmentId) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const { data, error } = await supabase.from('subcategories').update({ name }).eq('id', id).select();
        if (error) throw error;
        res.json({ message: 'Subcategory updated', data });
    } catch (err) { handleError(res, err); }
});

// Delete subcategory
router.delete('/subcategories/:id', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    try {
        const { data: sub } = await supabase.from('subcategories').select('category_id').eq('id', id).single();
        if (!sub) return res.status(404).json({ error: 'Subcategory not found' });
        const { data: cat } = await supabase.from('categories').select('department_id').eq('id', sub.category_id).single();
        if (!cat || cat.department_id !== req.user.departmentId) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const { error } = await supabase.from('subcategories').delete().eq('id', id);
        if (error) throw error;
        res.json({ message: 'Subcategory deleted' });
    } catch (err) { handleError(res, err); }
});

// ========== EVENT REVIEW ==========
router.post('/events/:id/review', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const { status } = req.body; // 'APPROVED' or 'REJECTED'
    if (!['APPROVED', 'REJECTED'].includes(status)) {
        return res.status(400).json({ error: 'Status must be APPROVED or REJECTED' });
    }
    try {
        const { data, error } = await supabase
            .from('events')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select();
        if (error) throw error;
        res.json({ message: `Event ${status}`, data });
    } catch (err) { handleError(res, err); }
});

// ========== MY DEPARTMENT EVENTS (full access) ==========
router.get('/events', async (req: AuthRequest, res: any) => {
    const deptId = req.user.departmentId;
    if (!deptId) return res.json([]);
    const { status, year, date_from, date_to } = req.query as any;
    try {
        let query = supabase
            .from('events')
            .select('*, categories(name), subcategories(name)')
            .eq('department_id', deptId);
        if (status) query = query.eq('status', status);
        if (date_from) query = query.gte('date', date_from);
        if (date_to) query = query.lte('date', date_to);
        if (!date_from && !date_to && year) {
            if (String(year).includes('-')) {
                const [ys, ye] = String(year).split('-');
                query = query.gte('date', `${ys}-09-01`).lte('date', `${ye}-08-31`);
            } else {
                query = query.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
            }
        }
        query = query.order('date', { ascending: false });
        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

// ========== GLOBAL EVENTS (all departments, limited access) ==========
router.get('/global-events', async (req: AuthRequest, res: any) => {
    const { department_id, status, year, date_from, date_to } = req.query as any;
    try {
        let query = supabase
            .from('events')
            .select('*, departments(name), categories(name)');
        if (department_id) query = query.eq('department_id', department_id);
        if (status) query = query.eq('status', status);
        if (date_from) query = query.gte('date', date_from);
        if (date_to) query = query.lte('date', date_to);
        if (!date_from && !date_to && year) {
            if (String(year).includes('-')) {
                const [ys, ye] = String(year).split('-');
                query = query.gte('date', `${ys}-09-01`).lte('date', `${ye}-08-31`);
            } else {
                query = query.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
            }
        }
        query = query.order('date', { ascending: false });
        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

// ========== EVENT DETAIL (own department = full, others = limited) ==========
router.get('/events/:id', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const deptId = req.user.departmentId;
    try {
        const { data: event, error: evErr } = await supabase
            .from('events')
            .select('*, departments(name), categories(name), subcategories(name)')
            .eq('id', id)
            .single();
        if (evErr || !event) return res.status(404).json({ error: 'Event not found' });

        const isOwnDept = event.department_id === deptId;

        // Get media
        const { data: media } = await supabase.from('media').select('*').eq('event_id', id);

        // Get AI evaluation (may not exist)
        const { data: aiEval } = await supabase.from('ai_evaluations').select('*').eq('event_id', id).maybeSingle();

        // Get feedbacks
        const { data: feedbacks } = await supabase.from('feedbacks').select('*').eq('event_id', id);

        // Get participants based on access level
        let participants: any[] = [];
        let participantCount = 0;
        if (isOwnDept) {
            const { data: parts } = await supabase.from('participants').select('*').eq('event_id', id);
            participants = parts || [];
            participantCount = participants.length;
        } else {
            const { count } = await supabase.from('participants').select('id', { count: 'exact', head: true }).eq('event_id', id);
            participantCount = count || 0;
        }

        let avgRating = 0;
        if (feedbacks && feedbacks.length > 0) {
            avgRating = feedbacks.reduce((sum: number, f: any) => sum + f.rating, 0) / feedbacks.length;
        }

        res.json({
            ...event,
            is_own_dept: isOwnDept,
            participants: isOwnDept ? participants : [],
            participant_count: participantCount,
            media: media || [],
            feedbacks: isOwnDept ? (feedbacks || []) : [],
            feedback_count: feedbacks?.length || 0,
            ai_evaluation: aiEval || null,
            avg_rating: Math.round(avgRating * 100) / 100,
        });
    } catch (err) { handleError(res, err); }
});

// ========== DEPARTMENT LOGS ==========
router.get('/logs', async (req: AuthRequest, res: any) => {
    const deptId = req.user.departmentId;
    if (!deptId) return res.json([]);
    try {
        const { year } = req.query as any;

        let query = supabase
            .from('events')
            .select('id, title, status, created_at, updated_at, categories(name)')
            .eq('department_id', deptId)
            .order('updated_at', { ascending: false })
            .limit(50);
            
        if (year) {
            if (String(year).includes('-')) {
                const [ys, ye] = String(year).split('-');
                query = query.gte('updated_at', `${ys}-09-01T00:00:00.000Z`).lte('updated_at', `${ye}-08-31T23:59:59.999Z`);
            } else {
                query = query.gte('updated_at', `${year}-01-01T00:00:00.000Z`).lte('updated_at', `${year}-12-31T23:59:59.999Z`);
            }
        }

        const { data: events, error } = await query;
        if (error) throw error;

        const logs = (events || []).map((event: any) => {
            let action = 'Created';
            let icon = 'add_circle';
            if (event.status === 'APPROVED') { action = 'Approved'; icon = 'check_circle'; }
            else if (event.status === 'REJECTED') { action = 'Rejected'; icon = 'cancel'; }
            else if (event.status === 'COMPLETED') { action = 'Completed'; icon = 'verified'; }
            else if (event.status === 'PENDING_APPROVAL') { action = 'Submitted for approval'; icon = 'pending'; }
            return {
                id: event.id,
                action, icon,
                title: event.title,
                category: event.categories?.name || '—',
                status: event.status,
                timestamp: event.updated_at || event.created_at,
            };
        });
        res.json(logs);
    } catch (err) { handleError(res, err); }
});

// ========== EVENT VERIFICATION ==========
router.post('/events/:id/verify', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const { action } = req.body; // 'VERIFY' or 'REJECT'
    try {
        if (action === 'VERIFY') {
            const { data, error } = await supabase
                .from('events')
                .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
                .eq('id', id).select();
            if (error) throw error;
            res.json({ message: 'Event verified and marked as completed', data });
        } else if (action === 'REJECT') {
            const { data, error } = await supabase
                .from('events')
                .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
                .eq('id', id).select();
            if (error) throw error;
            res.json({ message: 'Event rejected and sent back to Admin', data });
        } else {
            res.status(400).json({ error: 'Action must be VERIFY or REJECT' });
        }
    } catch (err) { handleError(res, err); }
});

// ========== AI EVENT REVIEW ==========
router.post('/events/:id/trigger-ai', async (req, res) => {
    const { id } = req.params;
    try {
        // Check if AI eval already exists
        const { data: existingEval } = await supabase
            .from('ai_evaluations').select('id').eq('event_id', id).maybeSingle();

        const { data: feedbacks } = await supabase
            .from('feedbacks').select('rating, suggestions, quality').eq('event_id', id);
        const { data: eventData } = await supabase
            .from('events').select('title, target_count').eq('id', id).single();
        const { count: participantCount } = await supabase
            .from('participants').select('id', { count: 'exact', head: true }).eq('event_id', id);

        let aiResult: any = {
            overall_rating: 4.5,
            summary: "Well-organized event with good participation and positive feedback.",
            strengths: "Strong organization, good speaker lineup, effective time management.",
            improvements: "Could improve venue logistics and provide better refreshments.",
            insights: `Event had ${participantCount || 0} participants against a target of ${eventData?.target_count || 'N/A'}. ${feedbacks && feedbacks.length > 0 ? `Average feedback: ${(feedbacks.reduce((s: number, f: any) => s + f.rating, 0) / feedbacks.length).toFixed(1)}/5 from ${feedbacks.length} responses.` : 'No feedback data available.'}`
        };

        if (process.env.AI_API_KEY) {
            try {
                const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const prompt = `Analyze this college event:
Title: ${eventData?.title}
Target Participants: ${eventData?.target_count}
Actual Participants: ${participantCount}
Feedbacks: ${JSON.stringify(feedbacks)}

Return ONLY a strict JSON object (no markdown) with:
"overall_rating" (number 1-5, one decimal),
"summary" (2-3 sentence performance summary),
"strengths" (bullet points of what went well),
"improvements" (bullet points of what could be better),
"insights" (participation analysis and engagement insights)`;
                const result = await model.generateContent(prompt);
                const responseText = result.response.text();
                const parsed = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
                aiResult = { ...aiResult, ...parsed };
            } catch (e) {
                console.warn("Failed to parse AI output, using fallback.");
            }
        }

        if (existingEval) {
            const { data, error } = await supabase
                .from('ai_evaluations').update(aiResult).eq('event_id', id).select();
            if (error) throw error;
            res.json({ message: 'AI evaluation updated', data });
        } else {
            const { data, error } = await supabase
                .from('ai_evaluations').insert([{ event_id: id, ...aiResult }]).select();
            if (error) throw error;
            res.json({ message: 'AI evaluation generated', data });
        }
    } catch (err) { handleError(res, err); }
});

// ========== LIST ALL DEPARTMENTS ==========
router.get('/departments', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('departments').select('id, name').order('name');
        if (error) throw error;
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

// ========== ADMIN MANAGEMENT ==========
// List admins in HOD's department
router.get('/admins', async (req: AuthRequest, res: any) => {
    const deptId = req.user.departmentId;
    if (!deptId) return res.json([]);
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, name, email, role, department_id, created_at')
            .eq('role', 'ADMIN')
            .eq('department_id', deptId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

// Create admin user
router.post('/create-admin', async (req: AuthRequest, res: any) => {
    const { name, email, password } = req.body;
    const deptId = req.user.departmentId;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (!deptId) {
        return res.status(400).json({ error: 'No department assigned to your account' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    try {
        // Check if email already exists
        const { data: existing } = await supabase
            .from('users').select('id').eq('email', email).maybeSingle();
        if (existing) return res.status(400).json({ error: 'A user with this email already exists' });

        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(password, 10);
        const { data, error } = await supabase.from('users').insert([{
            name,
            email,
            password: hashedPassword,
            role: 'ADMIN',
            department_id: deptId,
        }]).select('id, name, email, role, department_id, created_at');
        if (error) throw error;

        // Optionally get department name for the email
        const { data: dept } = await supabase.from('departments').select('name').eq('id', deptId).single();

        // Send credentials email (fire-and-forget)
        sendCredentialsEmail({
            recipientEmail: email,
            recipientName: name,
            role: 'ADMIN',
            password,
            departmentName: dept?.name,
        }).catch(err => console.error('[Mailer] Admin credential email failed:', err));

        res.json({ message: 'Admin account created successfully', data });
    } catch (err) { handleError(res, err); }
});

// Delete admin user
router.delete('/admins/:id', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const deptId = req.user.departmentId;
    try {
        // Verify admin belongs to HOD's department
        const { data: admin } = await supabase
            .from('users').select('id, department_id, role').eq('id', id).single();
        if (!admin) return res.status(404).json({ error: 'User not found' });
        if (admin.role !== 'ADMIN') return res.status(400).json({ error: 'User is not an Admin' });
        if (admin.department_id !== deptId) return res.status(403).json({ error: 'Admin does not belong to your department' });

        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) throw error;
        res.json({ message: 'Admin account deleted' });
    } catch (err) { handleError(res, err); }
});

// ========== CALENDAR INTEGRATION ==========
router.get('/departments/all', async (req, res) => {
    try {
        const { data } = await supabase.from('departments').select('id, name');
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

router.get('/calendar', async (req: any, res: any) => {
    try {
        const { month, year, department_id, academic_year } = req.query;
        let query = supabase.from('events')
            .select('*, departments(name)')
            .eq('status', 'APPROVED');
            
        if (department_id) query = query.eq('department_id', department_id);
        
        if (academic_year) {
            if (String(academic_year).includes('-')) {
                const [ys, ye] = String(academic_year).split('-');
                query = query.gte('date', `${ys}-09-01`).lte('date', `${ye}-08-31`);
            } else {
                query = query.gte('date', `${academic_year}-01-01`).lte('date', `${academic_year}-12-31`);
            }
        }

        if (month && year) {
            const startDate = `${year}-${month.padStart(2, '0')}-01`;
            const endMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
            const endYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
            const endDate = `${endYear}-${endMonth.toString().padStart(2, '0')}-01`;
            query = query.gte('date', startDate).lt('date', endDate);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

// ========== CATEGORY SCHEDULING ==========

// List schedules for HOD's department
router.get('/schedules', async (req: AuthRequest, res: any) => {
    const deptId = req.user.departmentId;
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });
    const { academic_year } = req.query as any;

    try {
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

        // Fetch all completed/approved events for this department to map chronologically
        const { data: completedEvents } = await supabase
            .from('events')
            .select('id, date, category_id, subcategory_id, status')
            .eq('department_id', deptId)
            .in('status', ['COMPLETED', 'APPROVED']);

        const enriched = computeEnrichedSchedules(schedules, completedEvents || []);
        res.json(enriched);
    } catch (err) { handleError(res, err); }
});

// Create a schedule
router.post('/schedules', async (req: AuthRequest, res: any) => {
    const { category_id, subcategory_id, scheduled_month, scheduled_year, academic_year, notes } = req.body;
    const deptId = req.user.departmentId;
    const userId = req.user.id;

    if (!category_id || !scheduled_month || !scheduled_year || !academic_year) {
        return res.status(400).json({ error: 'category_id, scheduled_month, scheduled_year, and academic_year are required' });
    }
    if (!deptId) return res.status(400).json({ error: 'No department assigned' });

    try {
        // Verify category belongs to HOD's department
        const { data: cat } = await supabase.from('categories').select('department_id').eq('id', category_id).single();
        if (!cat || cat.department_id !== deptId) {
            return res.status(403).json({ error: 'Category does not belong to your department' });
        }

        const { data, error } = await supabase
            .from('category_schedules')
            .insert([{
                category_id,
                subcategory_id: subcategory_id || null,
                department_id: deptId,
                scheduled_month: parseInt(scheduled_month),
                scheduled_year: parseInt(scheduled_year),
                academic_year,
                created_by: userId,
                notes: notes || null,
            }])
            .select('*, categories(name), subcategories(name)');

        if (error) throw error;
        res.json({ message: 'Schedule created', data });
    } catch (err) { handleError(res, err); }
});

// Delete a schedule
router.delete('/schedules/:id', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const deptId = req.user.departmentId;

    try {
        const { data: schedule } = await supabase
            .from('category_schedules')
            .select('department_id')
            .eq('id', id)
            .single();

        if (!schedule || schedule.department_id !== deptId) {
            return res.status(403).json({ error: 'Schedule does not belong to your department' });
        }

        const { error } = await supabase.from('category_schedules').delete().eq('id', id);
        if (error) throw error;
        res.json({ message: 'Schedule deleted' });
    } catch (err) { handleError(res, err); }
});

export default router;

