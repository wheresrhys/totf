'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors, fetchAllPaginatedRows } from '@/lib/supabase';
import {
	deriveFirstEverSpecies,
	deriveFirstOfYearSpecies,
	deriveLongAbsenceRetraps,
	deriveSessionTotalRecords,
	deriveSinceHighlights,
	deriveSpeciesRecords,
	deriveWeightRecordBreakers,
	sortHighlights,
	type SessionHighlight,
	type SessionStatsData
} from '@/app/models/session-highlights';
import type {
	LongAbsenceRetrapsResult,
	StatsPerDayAndSpeciesResult
} from '@/app/models/db';

// The stats blob only changes when new data is imported, so cache it
// per group rather than re-scanning Encounters on every session page view
const SESSION_STATS_CACHE_TTL_MS = 60 * 60 * 1000;
const sessionStatsCache = new Map<
	number,
	{ expiresAt: number; stats: SessionStatsData }
>();

async function fetchSessionStats(
	viewedGroupId: number
): Promise<SessionStatsData> {
	const cached = sessionStatsCache.get(viewedGroupId);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.stats;
	}
	const supabase = await getAuthenticatedSupabaseClient();
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
	return sortHighlights([
		...deriveSessionTotalRecords({ date, stats }),
		...deriveSinceHighlights({ date, stats }),
		...deriveSpeciesRecords({ date, stats }),
		...deriveFirstEverSpecies({ date, stats }),
		...deriveFirstOfYearSpecies({ date, stats }),
		...deriveLongAbsenceRetraps(longAbsenceRetrapResults, date),
		...deriveWeightRecordBreakers({ date, stats })
	]);
}
