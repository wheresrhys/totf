'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import {
	SESSION_TOTAL_METRICS,
	deriveSessionTotalRecords,
	getScopeFilters,
	sortHighlights,
	type ScopedTopPeriods,
	type SessionHighlight,
	type SessionTotalMetric
} from '@/app/models/session-highlights';
import type { TopMetricsFilterParams, TopPeriodsResult } from '@/app/models/db';

export async function fetchSessionHighlights({
	date,
	viewedGroupId
}: {
	date: string;
	viewedGroupId: number;
}): Promise<SessionHighlight[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const scopeFilters = getScopeFilters(new Date(date), viewedGroupId);
	const metricScopeCombinations = SESSION_TOTAL_METRICS.flatMap((metric) =>
		scopeFilters.map((scopeFilter) => ({ metric, ...scopeFilter }))
	);
	const scopedResults = await Promise.all(
		metricScopeCombinations.map(async ({ metric, scope, filters }) => {
			const rows = (await supabase
				.rpc('top_metrics_by_period', {
					temporal_unit: 'day',
					metric_name: metric,
					result_limit: 2,
					filters: filters as TopMetricsFilterParams
				})
				.then(catchSupabaseErrors)) as TopPeriodsResult[] | null;
			return { metric, scope, rows: rows ?? [] };
		})
	);
	const resultsByMetric = {} as Record<SessionTotalMetric, ScopedTopPeriods[]>;
	for (const metric of SESSION_TOTAL_METRICS) {
		resultsByMetric[metric] = scopedResults.filter(
			(result) => result.metric === metric
		);
	}
	return sortHighlights(deriveSessionTotalRecords({ date, resultsByMetric }));
}
