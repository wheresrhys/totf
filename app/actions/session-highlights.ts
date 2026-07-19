'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors, fetchAllPaginatedRows } from '@/lib/supabase';
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
	type SessionHighlight,
	type SessionStatsData
} from '@/app/models/session-highlights';
import type {
	LongAbsenceRetrapsResult,
	StatsPerDayAndSpeciesResult
} from '@/app/models/db';

// The stats blob only changes when new data is imported. The cache entry
// carries a version token (max Encounters.id for the group) so that a new
// import invalidates the cache immediately, even across lambda instances.
// The 60-min TTL is retained as a backstop for rare in-place re-imports
// that edit existing encounters without adding rows.
const SESSION_STATS_CACHE_TTL_MS = 60 * 60 * 1000;
const sessionStatsCache = new Map<
	number,
	{ version: number; expiresAt: number; stats: SessionStatsData }
>();

async function fetchStatsVersion(
	supabase: Awaited<ReturnType<typeof getAuthenticatedSupabaseClient>>,
	viewedGroupId: number
): Promise<number> {
	const { data } = await supabase
		.from('Encounters')
		.select('id')
		.eq('ringing_group_id', viewedGroupId)
		.order('id', { ascending: false })
		.limit(1);
	return data?.[0]?.id ?? 0;
}

async function fetchSessionStats(
	viewedGroupId: number
): Promise<SessionStatsData> {
	const supabase = await getAuthenticatedSupabaseClient();
	const currentVersion = await fetchStatsVersion(supabase, viewedGroupId);
	const cached = sessionStatsCache.get(viewedGroupId);
	if (
		cached &&
		cached.version === currentVersion &&
		cached.expiresAt > Date.now()
	) {
		return cached.stats;
	}
	const [daySpeciesStats, sessionRows] = await Promise.all([
		fetchAllPaginatedRows<StatsPerDayAndSpeciesResult>((fromRow, toRow) =>
			supabase
				.rpc('stats_per_day_and_species', {
					ringing_group_filter: viewedGroupId
				})
				.order('visit_date')
				.order('species_name')
				.range(fromRow, toRow)
		),
		fetchAllPaginatedRows<{ visit_date: string }>((fromRow, toRow) =>
			supabase
				.from('Sessions')
				.select('visit_date')
				.eq('ringing_group_id', viewedGroupId)
				.order('visit_date')
				.range(fromRow, toRow)
		)
	]);
	const stats: SessionStatsData = {
		daySpeciesStats,
		sessionDates: sessionRows.map((row) => row.visit_date)
	};
	sessionStatsCache.set(viewedGroupId, {
		version: currentVersion,
		expiresAt: Date.now() + SESSION_STATS_CACHE_TTL_MS,
		stats
	});
	return stats;
}

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
