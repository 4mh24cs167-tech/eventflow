export function computeEnrichedSchedules(schedules: any[], completedEvents: any[]): any[] {
    const now = new Date();
    // Deep clone to avoid mutating original arrays
    const eventsPool = [...completedEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const enrichedSchedules = [];

    // Group schedules by category and subcategory
    const groups = new Map<string, any[]>();
    for (const schedule of schedules) {
        const key = `${schedule.category_id}-${schedule.subcategory_id || 'NONE'}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(schedule);
    }

    for (const [key, groupSchedules] of groups.entries()) {
        // Sort schedules chronologically by year then month
        groupSchedules.sort((a, b) => {
            if (a.scheduled_year !== b.scheduled_year) return a.scheduled_year - b.scheduled_year;
            return a.scheduled_month - b.scheduled_month;
        });

        // Filter events belonging to this specific category/subcategory
        const [categoryId, subIdStr] = key.split('-');
        const subcategoryId = subIdStr === 'NONE' ? null : subIdStr;

        let availableEvents = eventsPool.filter(e => {
            if (e.category_id !== categoryId) return false;
            if (subcategoryId && e.subcategory_id !== subcategoryId) return false;
            // If schedule has NO subcategory, do we count any event inside the category? Yes.
            return true;
        });

        for (const schedule of groupSchedules) {
            const schedMonth = schedule.scheduled_month;
            const schedYear = schedule.scheduled_year;
            const monthStart = new Date(schedYear, schedMonth - 1, 1);
            const monthEnd = new Date(schedYear, schedMonth, 0, 23, 59, 59);

            // Try to find an On-Time event
            const onTimeIdx = availableEvents.findIndex(e => {
                const eDate = new Date(e.date);
                return eDate >= monthStart && eDate <= monthEnd;
            });

            if (onTimeIdx !== -1) {
                const consumedEvent = availableEvents.splice(onTimeIdx, 1)[0]; // Consume the event
                enrichedSchedules.push({ ...schedule, computed_status: 'COMPLETED', completed_date: consumedEvent.date });
                continue;
            }

            // Try to find a Late event
            const lateIdx = availableEvents.findIndex(e => {
                const eDate = new Date(e.date);
                return eDate > monthEnd;
            });

            if (lateIdx !== -1) {
                const consumedEvent = availableEvents.splice(lateIdx, 1)[0]; // Consume the event
                enrichedSchedules.push({ ...schedule, computed_status: 'COMPLETED_LATE', completed_date: consumedEvent.date });
                continue;
            }

            // Otherwise, if no event is found:
            // If the deadline hasn't passed, it is still upcoming.
            if (now <= monthEnd) {
                enrichedSchedules.push({ ...schedule, computed_status: 'UPCOMING' });
            } else {
                enrichedSchedules.push({ ...schedule, computed_status: 'MISSED' });
            }
        }
    }

    // Restore original ordering
    const originalIds = schedules.map(s => s.id);
    enrichedSchedules.sort((a, b) => originalIds.indexOf(a.id) - originalIds.indexOf(b.id));

    return enrichedSchedules;
}
