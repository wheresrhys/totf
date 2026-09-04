'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { fetchSessionStats } from '@/lib/underlying-stats';
import {
	rarities,
	counts,
	vitalStats,
	deriveLongAbsenceRetraps,
	type SessionHighlight
} from '@/app/models/highlights';
import type { LongAbsenceRetrapsResult } from '@/app/models/db';

export async function fetchSessionHighlights({
	date,
	viewedGroupId
}: {
	date: string;
	viewedGroupId: number;
}): Promise<SessionHighlight[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const [stats, longAbsenceRetrapResults] = await Promise.all([
		fetchSessionStats(viewedGroupId),
		supabase
			.rpc('long_absence_retraps', {
				session_date: date,
				ringing_group_filter: viewedGroupId
			})
			.then(catchSupabaseErrors)
			.then((results) => (results ?? []) as LongAbsenceRetrapsResult[])
	]);
	// Each group composes its own already-ordered block list — see
	// docs/session-highlight-ordering.md. The flat "Standouts" list is a
	// literal concatenation, long-absence-retrap last (it's a sibling of the
	// three groups, not one of them). Highlights are plain data, so this
	// serialises across the RSC boundary as-is; the client renders each via
	// renderHighlight.
	return [
		...rarities({ date, stats }),
		...counts({ date, stats }),
		...vitalStats({ date, stats }),
		...deriveLongAbsenceRetraps(longAbsenceRetrapResults, date)
	];
}
