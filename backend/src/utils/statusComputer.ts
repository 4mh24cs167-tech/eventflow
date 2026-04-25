export function computeEnrichedSchedules(schedules: any[], completedEvents: any[]): any[] {
    const now = new Date();
    // Sort events chronologically
    const eventsPool = [...completedEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const enrichedSchedules: any[] = [];

    console.log('[StatusComputer] Input schedules:', schedules.length, 'Input events:', eventsPool.length);
    console.log('[StatusComputer] Events:', JSON.stringify(eventsPool.map(e => ({ id: e.id, cat: e.category_id, sub: e.subcategory_id, date: e.date }))));

    // Group schedules by category and subcategory
    const groups = new Map<string, any[]>();
    for (const schedule of schedules) {
        const key = `${schedule.category_id}-${schedule.subcategory_id || 'NONE'}`;
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

        const [categoryId, subIdStr] = key.split('-');
        const subcategoryId = subIdStr === 'NONE' ? null : subIdStr;

        console.log(`[StatusComputer] Processing group: key=${key}, categoryId=${categoryId}, subcategoryId=${subcategoryId}`);

        // Match events by category, with flexible subcategory matching
        const matchesCategory = (e: any) => {
            if (e.category_id !== categoryId) return false;
            if (subcategoryId) {
                // Accept if event has same subcategory OR event has no subcategory (general category event)
                return !e.subcategory_id || e.subcategory_id === subcategoryId;
            }
            return true;
        };

        // Log which events match this category
        const matchingEvents = eventsPool.filter(e => !usedEventIds.has(e.id) && matchesCategory(e));
        console.log(`[StatusComputer] Matching events for ${key}:`, JSON.stringify(matchingEvents.map(e => ({ id: e.id, date: e.date, cat: e.category_id, sub: e.subcategory_id }))));

        for (const schedule of groupSchedules) {
            const schedMonth = schedule.scheduled_month;
            const schedYear = schedule.scheduled_year;
            const monthStart = new Date(schedYear, schedMonth - 1, 1);
            const monthEnd = new Date(schedYear, schedMonth, 0, 23, 59, 59);

            console.log(`[StatusComputer] Schedule: month=${schedMonth}, year=${schedYear}, monthStart=${monthStart.toISOString()}, monthEnd=${monthEnd.toISOString()}`);

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
                console.log(`[StatusComputer] -> COMPLETED (on-time), event: ${consumedEvent.id}, date: ${consumedEvent.date}`);
                enrichedSchedules.push({ ...schedule, computed_status: 'COMPLETED', completed_date: consumedEvent.date });
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
                console.log(`[StatusComputer] -> COMPLETED_LATE, event: ${consumedEvent.id}, date: ${consumedEvent.date}`);
                enrichedSchedules.push({ ...schedule, computed_status: 'COMPLETED_LATE', completed_date: consumedEvent.date });
                continue;
            }

            // No matching event found
            if (now <= monthEnd) {
                console.log(`[StatusComputer] -> UPCOMING (deadline not passed yet)`);
                enrichedSchedules.push({ ...schedule, computed_status: 'UPCOMING' });
            } else {
                console.log(`[StatusComputer] -> MISSED (no events found, deadline passed)`);
                enrichedSchedules.push({ ...schedule, computed_status: 'MISSED' });
            }
        }
    }

    // Restore original ordering
    const originalIds = schedules.map((s: any) => s.id);
    enrichedSchedules.sort((a, b) => originalIds.indexOf(a.id) - originalIds.indexOf(b.id));

    return enrichedSchedules;
}
