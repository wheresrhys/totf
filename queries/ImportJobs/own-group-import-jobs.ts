import type { TableQueryDefinition } from '../types';

/**
 * A group's own recent import jobs — overall status, row counts, and the 5
 * independent per-temporal-unit stats-cache refresh statuses. Powers
 * `fetchOwnGroupImportJobs` (`app/actions/import-jobs.ts`), which backs the
 * `/stats-consistency` page's import-jobs table and per-column "retrigger"
 * action (#1388).
 */
export const ownGroupImportJobsQuery: TableQueryDefinition = {
	table: 'ImportJobs',
	name: 'own-group-import-jobs',
	select:
		'id, status, started_at, finished_at, rows_processed, rows_successful, rows_failed, day_stats_refresh_status, month_stats_refresh_status, year_stats_refresh_status, month_squashed_stats_refresh_status, all_time_stats_refresh_status',
	fixturePaths: ['tables/ImportJobs/alpha.own-group-import-jobs.json']
};
