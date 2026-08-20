'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { fetchSessionStats } from '@/lib/underlying-stats';
import { runHighlightMachine } from '@/app/models/highlight-refinement-machine';
import {
	deriveFirstEverSpecies,
	deriveFirstOfYearSpecies,
	deriveLongAbsenceRetraps,
	deriveRareSpecies,
	deriveSessionTotalRecords,
	deriveSessionTotalJuvRecords,
	deriveSinceHighlights,
	deriveSpeciesRecords,
	deriveSpeciesJuvRecords,
	deriveWeightRecordBreakers,
	type SessionHighlight
} from '@/app/models/session-highlights';
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
	const highlightPool = [
		...deriveSessionTotalRecords({ date, stats }),
		...deriveSessionTotalJuvRecords({ date, stats }),
		...deriveSinceHighlights({ date, stats }),
		...deriveSpeciesRecords({ date, stats }),
		...deriveSpeciesJuvRecords({ date, stats }),
		...deriveFirstEverSpecies({ date, stats }),
		...deriveFirstOfYearSpecies({ date, stats }),
		...deriveRareSpecies({ date, stats }),
		...deriveLongAbsenceRetraps(longAbsenceRetrapResults, date),
		...deriveWeightRecordBreakers({ date, stats })
	];
	// Highlights are plain data, so the machine's output serialises across the
	// RSC boundary as-is; the client component renders each via renderHighlight.
	return runHighlightMachine(highlightPool);
}
