import { Router } from 'express';
import { supabase } from '../utils/supabase';
import { authenticateToken, requireRole, AuthRequest } from '../middlewares/authMiddleware';
import bcrypt from 'bcrypt';
import { sendCredentialsEmail } from '../utils/mailer';
import { computeEnrichedSchedules } from '../utils/statusComputer';

const router = Router();
router.use(authenticateToken);
router.use(requireRole(['PRINCIPAL']));

const handleError = (res: any, err: any) => res.status(500).json({ error: err.message });

// ========== DASHBOARD ==========
router.get('/dashboard', async (req, res) => {
    try {
        const { count: deptCount } = await supabase.from('departments').select('*', { count: 'exact', head: true });
        const { count: eventCount } = await supabase.from('events').select('*', { count: 'exact', head: true });
        const { count: completedCount } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'COMPLETED');
        const { count: pendingCount } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'PENDING_APPROVAL');
        const { count: approvedCount } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'APPROVED');
        const { count: rejectedCount } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'REJECTED');
        const { count: participantCount } = await supabase.from('participants').select('*', { count: 'exact', head: true });

        res.json({
            totalDepartments: deptCount || 0,
            totalEvents: eventCount || 0,
            completedEvents: completedCount || 0,
            pendingEvents: pendingCount || 0,
            approvedEvents: approvedCount || 0,
            rejectedEvents: rejectedCount || 0,
            totalParticipants: participantCount || 0,
        });
    } catch (err) { handleError(res, err); }
});

// ========== DEPARTMENTS ==========
// List all departments with HOD info
router.get('/departments', async (req, res) => {
    try {
        const { data: departments, error } = await supabase
            .from('departments')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;

        // Get HOD names for each department
        const enriched = await Promise.all((departments || []).map(async (dept: any) => {
            let hodName = null;
            if (dept.hod_id) {
                const { data: hod } = await supabase.from('users').select('name, email').eq('id', dept.hod_id).single();
                hodName = hod?.name || null;
            }
            // Count events in this department
            const { count: eventCount } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('department_id', dept.id);
            // Count completed events
            const { count: completedCount } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('department_id', dept.id).eq('status', 'COMPLETED');
            // Count pending events
            const { count: pendingCount } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('department_id', dept.id).eq('status', 'PENDING_APPROVAL');

            return {
                ...dept,
                hod_name: hodName,
                event_count: eventCount || 0,
                completed_count: completedCount || 0,
                pending_count: pendingCount || 0,
            };
        }));

        res.json(enriched);
    } catch (err) { handleError(res, err); }
});

// Create department
router.post('/departments', async (req: AuthRequest, res: any) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Department name is required' });
    try {
        const { data, error } = await supabase.from('departments').insert([{
            name,
            principal_id: req.user.id
        }]).select();

        if (error) throw error;
        res.json({ message: 'Department created', data });
    } catch (err) { handleError(res, err); }
});

// Update department (assign HOD)
router.put('/departments/:id', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const { name, hod_id } = req.body;
    try {
        const updateData: any = {};
        if (name) updateData.name = name;
        if (hod_id !== undefined) updateData.hod_id = hod_id || null;

        const { data, error } = await supabase.from('departments').update(updateData).eq('id', id).select();
        if (error) throw error;

        // Update HOD's department_id
        if (hod_id) {
            await supabase.from('users').update({ department_id: id }).eq('id', hod_id);
        }

        res.json({ message: 'Department updated', data });
    } catch (err) { handleError(res, err); }
});

// ========== CREATE HOD USER ==========
router.post('/create-hod', async (req: AuthRequest, res: any) => {
    const { name, email, password, department_id } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (!department_id) {
        return res.status(400).json({ error: 'Department is required. Each HOD must be assigned to a department.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    try {
        // Check if email already exists
        const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
        if (existing) return res.status(400).json({ error: 'A user with this email already exists' });

        // Check if department already has an HOD
        const { data: dept } = await supabase.from('departments').select('id, name, hod_id').eq('id', department_id).single();
        if (!dept) return res.status(400).json({ error: 'Department not found' });
        if (dept.hod_id) {
            return res.status(400).json({ error: `Department "${dept.name}" already has an HOD assigned. Only one HOD per department is allowed.` });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const { data, error } = await supabase.from('users').insert([{
            name,
            email,
            password: hashedPassword,
            role: 'HOD',
            department_id,
        }]).select('id, name, email, role, department_id, created_at');
        if (error) throw error;

        // Assign this HOD to the department
        if (data && data[0]) {
            await supabase.from('departments').update({ hod_id: data[0].id }).eq('id', department_id);
        }

        // Send credentials email (fire-and-forget)
        sendCredentialsEmail({
            recipientEmail: email,
            recipientName: name,
            role: 'HOD',
            password,
            departmentName: dept.name,
        }).catch(err => console.error('[Mailer] HOD credential email failed:', err));

        res.json({ message: 'HOD account created successfully', data });
    } catch (err) { handleError(res, err); }
});

// ========== DELETE HOD ==========
router.delete('/hods/:id', async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    try {
        // Check if the user exists and is an HOD
        const { data: hod } = await supabase.from('users').select('id, role').eq('id', id).single();
        if (!hod) return res.status(404).json({ error: 'User not found' });
        if (hod.role !== 'HOD') return res.status(400).json({ error: 'User is not an HOD' });

        // Unassign them from the department first
        await supabase.from('departments').update({ hod_id: null }).eq('hod_id', id);

        // Delete the user
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) throw error;

        res.json({ message: 'HOD removed successfully' });
    } catch (err) { handleError(res, err); }
});


// ========== LIST ALL HOD USERS (for assigning) ==========
router.get('/hods', async (req, res) => {
    try {
        const { data, error } = await supabase.from('users').select('id, name, email, department_id').eq('role', 'HOD');
        if (error) throw error;
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

// ========== ALL EVENTS ==========
router.get('/events', async (req: any, res: any) => {
    try {
        const { department_id, status, year } = req.query;

        let query = supabase.from('events').select('*, departments(name), categories(name)');

        if (department_id) query = query.eq('department_id', department_id);
        if (status) query = query.eq('status', status);
        if (year) {
            if (String(year).includes('-')) {
                const [ys, ye] = String(year).split('-');
                query = query.gte('date', `${ys}-09-01T00:00:00Z`).lte('date', `${ye}-08-31T23:59:59Z`);
            } else {
                const startDate = `${year}-01-01T00:00:00Z`;
                const endDate = `${year}-12-31T23:59:59Z`;
                query = query.gte('date', startDate).lte('date', endDate);
            }
        }

        query = query.order('date', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

// ========== DEPARTMENT DRILL DOWN ==========
router.get('/departments/:id/events', async (req, res) => {
    const { id } = req.params;
    try {
        const { data: dept } = await supabase.from('departments').select('*').eq('id', id).single();
        const { data: events, error } = await supabase
            .from('events')
            .select('*, categories(name)')
            .eq('department_id', id)
            .order('date', { ascending: false });
        if (error) throw error;

        // Department stats
        const total = events?.length || 0;
        const completed = events?.filter((e: any) => e.status === 'COMPLETED').length || 0;
        const pending = events?.filter((e: any) => e.status === 'PENDING_APPROVAL').length || 0;
        const approved = events?.filter((e: any) => e.status === 'APPROVED').length || 0;

        res.json({
            department: dept,
            stats: { total, completed, pending, approved },
            events: events || [],
        });
    } catch (err) { handleError(res, err); }
});

// ========== EVENT DETAILS (Full) ==========
router.get('/events/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [
            { data: event },
            { data: participants },
            { data: media },
            { data: feedbacks },
            { data: aiEval },
        ] = await Promise.all([
            supabase.from('events').select('*, departments(name), categories(name), subcategories(name)').eq('id', id).single(),
            supabase.from('participants').select('*').eq('event_id', id).order('created_at', { ascending: false }),
            supabase.from('media').select('*').eq('event_id', id),
            supabase.from('feedbacks').select('*').eq('event_id', id),
            supabase.from('ai_evaluations').select('*').eq('event_id', id).single(),
        ]);

        // Calculate average rating from feedback
        let avgRating = 0;
        if (feedbacks && feedbacks.length > 0) {
            avgRating = feedbacks.reduce((sum: number, f: any) => sum + f.rating, 0) / feedbacks.length;
        }

        res.json({
            ...event,
            participants: participants || [],
            media: media || [],
            feedbacks: feedbacks || [],
            ai_evaluation: aiEval || null,
            participant_count: participants?.length || 0,
            feedback_count: feedbacks?.length || 0,
            avg_rating: Math.round(avgRating * 100) / 100,
        });
    } catch (err) { handleError(res, err); }
});

// ========== REPORTS ==========
router.get('/reports', async (req, res) => {
    try {
        const { data: departments } = await supabase.from('departments').select('id, name');

        const reports = await Promise.all((departments || []).map(async (dept: any) => {
            const { count: total } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('department_id', dept.id);
            const { count: completed } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('department_id', dept.id).eq('status', 'COMPLETED');
            const { count: pending } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('department_id', dept.id).eq('status', 'PENDING_APPROVAL');
            const { count: approved } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('department_id', dept.id).eq('status', 'APPROVED');
            const { count: rejected } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('department_id', dept.id).eq('status', 'REJECTED');
            const { count: participants } = await supabase.from('participants')
                .select('*, events!inner(department_id)', { count: 'exact', head: true })
                .eq('events.department_id', dept.id);

            return {
                department_id: dept.id,
                department_name: dept.name,
                total_events: total || 0,
                completed: completed || 0,
                pending: pending || 0,
                approved: approved || 0,
                rejected: rejected || 0,
                participants: participants || 0,
                completion_rate: total ? Math.round(((completed || 0) / total) * 100) : 0,
            };
        }));

        res.json(reports);
    } catch (err) { handleError(res, err); }
});

// ========== GLOBAL LOGS ==========
router.get('/logs', async (req, res) => {
    try {
        // Fetch recent events as activity logs (sorted by updated_at)
        const { data: events, error } = await supabase
            .from('events')
            .select('id, title, status, created_at, updated_at, departments(name), categories(name)')
            .order('updated_at', { ascending: false })
            .limit(50);
        if (error) throw error;

        // Transform events into log entries
        const logs = (events || []).map((event: any) => {
            let action = 'Created';
            let icon = 'add_circle';
            if (event.status === 'APPROVED') { action = 'Approved'; icon = 'check_circle'; }
            else if (event.status === 'REJECTED') { action = 'Rejected'; icon = 'cancel'; }
            else if (event.status === 'COMPLETED') { action = 'Completed'; icon = 'verified'; }
            else if (event.status === 'PENDING_APPROVAL') { action = 'Submitted for approval'; icon = 'pending'; }

            return {
                id: event.id,
                action,
                icon,
                title: event.title,
                department: event.departments?.name || '—',
                category: event.categories?.name || '—',
                status: event.status,
                timestamp: event.updated_at || event.created_at,
            };
        });

        res.json(logs);
    } catch (err) { handleError(res, err); }
});

// ========== CALENDAR EVENTS ==========
router.get('/calendar', async (req: any, res: any) => {
    try {
        const { month, year, department_id, academic_year } = req.query;

        let query = supabase.from('events').select('id, title, date, status, venue, departments(name)');

        if (department_id) query = query.eq('department_id', department_id);

        if (academic_year) {
            if (String(academic_year).includes('-')) {
                const [ys, ye] = String(academic_year).split('-');
                query = query.gte('date', `${ys}-09-01`).lte('date', `${ye}-08-31`);
            } else {
                query = query.gte('date', `${academic_year}-01-01`).lte('date', `${academic_year}-12-31`);
            }
        }

        if (year && month) {
            const start = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString();
            const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59).toISOString();
            query = query.gte('date', start).lte('date', end);
        } else if (year && !academic_year) {
            if (String(year).includes('-')) {
                const [ys, ye] = String(year).split('-');
                query = query.gte('date', `${ys}-09-01`).lte('date', `${ye}-08-31`);
            } else {
                query = query.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
            }
        }

        query = query.order('date', { ascending: true });

        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (err) { handleError(res, err); }
});

// ========== SCHEDULE OVERVIEW (all departments) ==========

router.get('/schedules', async (req: any, res: any) => {
    const { academic_year, department_id } = req.query;

    try {
        let query = supabase
            .from('category_schedules')
            .select('*, categories(name), subcategories(name), departments(name)')
            .order('scheduled_year', { ascending: true })
            .order('scheduled_month', { ascending: true });

        if (academic_year) query = query.eq('academic_year', academic_year);
        if (department_id) query = query.eq('department_id', department_id);

        const { data: schedules, error } = await query;
        if (error) throw error;
        
        if (!schedules || schedules.length === 0) return res.json([]);

        // Fetch completed events
        let eventsQuery = supabase
            .from('events')
            .select('id, date, category_id, subcategory_id, department_id')
            .eq('status', 'COMPLETED');
            
        if (department_id) eventsQuery = eventsQuery.eq('department_id', department_id);

        const { data: completedEvents } = await eventsQuery;

        // For principal, we need to group by department_id and run the status computer for each department independently
        const deptGroups = new Map<string, any[]>();
        const eventGroups = new Map<string, any[]>();

        for (const s of schedules) {
            if (!deptGroups.has(s.department_id)) deptGroups.set(s.department_id, []);
            deptGroups.get(s.department_id)!.push(s);
        }

        for (const e of (completedEvents || [])) {
            if (!eventGroups.has(e.department_id)) eventGroups.set(e.department_id, []);
            eventGroups.get(e.department_id)!.push(e);
        }

        let enriched: any[] = [];
        for (const [deptId, deptSchedules] of deptGroups.entries()) {
            const deptEvents = eventGroups.get(deptId) || [];
            const result = computeEnrichedSchedules(deptSchedules, deptEvents);
            enriched = enriched.concat(result);
        }

        // Restore chronological order globally
        enriched.sort((a, b) => {
            if (a.scheduled_year !== b.scheduled_year) return a.scheduled_year - b.scheduled_year;
            return a.scheduled_month - b.scheduled_month;
        });

        res.json(enriched);
    } catch (err) { handleError(res, err); }
});

// ========== DEPARTMENT EVENT CHART ==========
router.get('/departments/:id/event-chart', async (req, res: any) => {
    const { id } = req.params;
    try {
        // Get department info
        const { data: dept } = await supabase.from('departments').select('id, name').eq('id', id).single();
        if (!dept) return res.status(404).json({ error: 'Department not found' });

        // Get all categories for this department
        const { data: categories, error: catErr } = await supabase
            .from('categories')
            .select('id, name')
            .eq('department_id', id)
            .order('name', { ascending: true });
        if (catErr) throw catErr;

        // For each category, get subcategories and event counts
        const chart = await Promise.all((categories || []).map(async (cat: any) => {
            // Count events for this category
            const { count: catEventCount } = await supabase
                .from('events')
                .select('*', { count: 'exact', head: true })
                .eq('category_id', cat.id)
                .eq('department_id', id);

            // Get subcategories
            const { data: subcats } = await supabase
                .from('subcategories')
                .select('id, name')
                .eq('category_id', cat.id)
                .order('name', { ascending: true });

            // Count events per subcategory
            const subcatData = await Promise.all((subcats || []).map(async (sub: any) => {
                const { count: subEventCount } = await supabase
                    .from('events')
                    .select('*', { count: 'exact', head: true })
                    .eq('subcategory_id', sub.id)
                    .eq('department_id', id);
                return {
                    id: sub.id,
                    name: sub.name,
                    event_count: subEventCount || 0,
                };
            }));

            return {
                id: cat.id,
                name: cat.name,
                event_count: catEventCount || 0,
                subcategories: subcatData,
            };
        }));

        res.json({ department: dept, chart });
    } catch (err) { handleError(res, err); }
});

export default router;

