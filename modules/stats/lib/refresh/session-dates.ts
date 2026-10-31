import type { SupabaseClient } from '@supabase/supabase-js';
import { catchSupabaseErrors } from '@/lib/supabase';

/**
 * Every distinct `Sessions.visit_date` the group has, sorted ascending — the
 * real-date domain `batchPeriodsBySessionDateSpan` indexes touched `day`
 * periods into. Same `.from('Sessions').select('visit_date').eq(...)
 * .order(...)` shape already used live in `app/(routes)/species/page.tsx`'s
 * `fetchYears`. No `.distinct()` needed: `Sessions`' own
 * `UNIQUE (visit_date, ringing_group_id)` constraint already guarantees one
 * row per distinct date for a given group.
 */
export async function fetchGroupSessionDates(
	supabaseClient: SupabaseClient,
	groupId: number
): Promise<string[]> {
	const rows = (await supabaseClient
		.from('Sessions')
		.select('visit_date')
		.eq('ringing_group_id', groupId)
		.order('visit_date', { ascending: true })
		.then(catchSupabaseErrors)) as { visit_date: string }[] | null;
	return (rows ?? []).map((row) => row.visit_date);
}
