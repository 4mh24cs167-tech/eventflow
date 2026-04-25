export function computeEnrichedSchedules(schedules: any[], completedEvents: any[]): any[] {
    const now = new Date();
    // Sort events chronologically
    const eventsPool = [...completedEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const enrichedSchedules: any[] = [];

    // Group schedules by category and subcategory
    // Use a separator that won't appear in UUIDs
    const SEP = '|||';
    const groups = new Map<string, any[]>();
    for (const schedule of schedules) {
        const key = `${schedule.category_id}${SEP}${schedule.subcategory_id || 'NONE'}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(schedule);
    }

    // Track which events have been consumed globally
    const usedEventIds = new Set<string>();

    for (const [key, groupSchedules] of groups.entries()) {
        // Sort schedules chronologically by year then month
        groupSchedules.sort((a: any, b: any) => {
            if (a.scheduled_year !== b.scheduled_year) return a.scheduled_year - b.scheduled_year;
            return a.scheduled_month - b.scheduled_month;
        });

        const parts = key.split(SEP);
        const categoryId = parts[0];
        const subcategoryId = parts[1] === 'NONE' ? null : parts[1];

        // Match events by category, with flexible subcategory matching
        const matchesCategory = (e: any) => {
            if (e.category_id !== categoryId) return false;
            if (subcategoryId) {
                // Accept if event has same subcategory OR event has no subcategory (general category event)
                return !e.subcategory_id || e.subcategory_id === subcategoryId;
            }
            return true;
        };

        for (const schedule of groupSchedules) {
            const schedMonth = schedule.scheduled_month;
            const schedYear = schedule.scheduled_year;
            const monthStart = new Date(schedYear, schedMonth - 1, 1);
            const monthEnd = new Date(schedYear, schedMonth, 0, 23, 59, 59);

            // Try to find an On-Time event (within the scheduled month)
            const onTimeIdx = eventsPool.findIndex(e => {
                if (usedEventIds.has(e.id)) return false;
                if (!matchesCategory(e)) return false;
                const eDate = new Date(e.date);
                return eDate >= monthStart && eDate <= monthEnd;
            });

            if (onTimeIdx !== -1) {
                const consumedEvent = eventsPool[onTimeIdx];
                usedEventIds.add(consumedEvent.id);
                const finalStatus = consumedEvent.status === 'APPROVED' ? 'APPROVED' : 'COMPLETED';
                enrichedSchedules.push({ ...schedule, computed_status: finalStatus, completed_date: consumedEvent.date });
                continue;
            }

            // Try to find a Late event (after the scheduled month)
            const lateIdx = eventsPool.findIndex(e => {
                if (usedEventIds.has(e.id)) return false;
                if (!matchesCategory(e)) return false;
                const eDate = new Date(e.date);
                return eDate > monthEnd;
            });

            if (lateIdx !== -1) {
                const consumedEvent = eventsPool[lateIdx];
                usedEventIds.add(consumedEvent.id);
                const finalStatus = consumedEvent.status === 'APPROVED' ? 'APPROVED_LATE' : 'COMPLETED_LATE';
                enrichedSchedules.push({ ...schedule, computed_status: finalStatus, completed_date: consumedEvent.date });
                continue;
            }

            // No matching event found
            if (now <= monthEnd) {
                enrichedSchedules.push({ ...schedule, computed_status: 'UPCOMING' });
            } else {
                enrichedSchedules.push({ ...schedule, computed_status: 'MISSED' });
            }
        }
    }

    // Restore original ordering
    const originalIds = schedules.map((s: any) => s.id);
    enrichedSchedules.sort((a, b) => originalIds.indexOf(a.id) - originalIds.indexOf(b.id));

    return enrichedSchedules;
}
