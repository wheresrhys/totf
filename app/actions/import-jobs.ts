'use server';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { Database } from '@/types/supabase.types';
import { ownGroupImportJobsQuery } from '@/queries';
import { getGroupCookie } from './group-cookie';

const RECENT_IMPORT_JOBS_LIMIT = 20;

// The columns ownGroupImportJobsQuery.select names — overall outcome, row
// counts, and the 5 independent per-temporal-unit stats-cache refresh
// statuses (#1388).
export type OwnGroupImportJobRow = Pick<
	Database['public']['Tables']['ImportJobs']['Row'],
	| 'id'
	| 'status'
	| 'started_at'
	| 'finished_at'
	| 'rows_processed'
	| 'rows_successful'
	| 'rows_failed'
	| 'day_stats_refresh_status'
	| 'month_stats_refresh_status'
	| 'year_stats_refresh_status'
	| 'month_squashed_stats_refresh_status'
	| 'all_time_stats_refresh_status'
>;

/**
 * Lists the caller's own group's most recent import jobs, most recent first —
 * powers the /stats-consistency page's import-jobs table (#1388). Never
 * takes an explicit groupId param — it always reads the caller's own group
 * id from the session cookie, the same `updatePublicSummaryEnabled`/
 * `regenerateStatsCache` convention (`app/actions/settings.ts`,
 * `app/actions/regenerate-stats-cache.ts`) follows.
 *
 * Returns an empty array, without querying Supabase, when no group is
 * selected — the same "no throw, typed empty result" shape those two
 * functions use, adapted for a read that has no failure case of its own. A
 * genuine Supabase error still surfaces as a thrown exception via
 * `catchSupabaseErrors`, matching `fetchOwnGroupPublicAreas`.
 */
export async function fetchOwnGroupImportJobs(): Promise<
	OwnGroupImportJobRow[]
> {
	const groupId = await getGroupCookie();
	if (groupId === null) {
		return [];
	}

	const supabase = await getAuthenticatedSupabaseClient();
	const rows = await (supabase
		.from('ImportJobs')
		.select(ownGroupImportJobsQuery.select)
		.eq('ringing_group_id', groupId)
		.order('started_at', { ascending: false })
		.limit(RECENT_IMPORT_JOBS_LIMIT)
		.then(catchSupabaseErrors) as Promise<OwnGroupImportJobRow[] | null>);

	return rows ?? [];
}
