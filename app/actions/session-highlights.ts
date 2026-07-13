'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import {
	deriveSessionTotalRecords,
	sortHighlights,
	type SessionHighlight,
	type SessionStatsData
} from '@/app/models/session-highlights';
import type {
	DaySpeciesMetricRow,
	TopMetricsFilterParams
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
	const [daySpeciesCounts, sessionRows] = await Promise.all([
		fetchAllPaginatedRows<DaySpeciesMetricRow>((fromRow, toRow) =>
			supabase
				.rpc('metrics_by_period_and_species', {
					temporal_unit: 'day',
					metric_name: 'encounters',
					filters: {
						ringing_group_filter: viewedGroupId
					} as TopMetricsFilterParams
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
		daySpeciesCounts,
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
	const stats = await fetchSessionStats(viewedGroupId);
	return sortHighlights(deriveSessionTotalRecords({ date, stats }));
}
