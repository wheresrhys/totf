import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase.types';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import type { ImportJobRowCounts } from '../types';
import type { StatsCacheRefreshOutcome } from '@/modules/stats';

type ImportJobsInsert = Database['public']['Tables']['ImportJobs']['Insert'];
type ImportJobsUpdate = Database['public']['Tables']['ImportJobs']['Update'];

/** Which `ImportJobs` column each temporal unit's refresh outcome lands on (#1154). */
const STATS_CACHE_REFRESH_STATUS_COLUMNS: Record<StatsTemporalUnit, string> = {
	day: 'day_stats_refresh_status',
	month: 'month_stats_refresh_status',
	year: 'year_stats_refresh_status',
	'month-squashed': 'month_squashed_stats_refresh_status',
	'all-time': 'all_time_stats_refresh_status'
};

/** Reads and writes the `ImportJobs` row tracking one import run — see modules/demon-import/CLAUDE.md's "Design choices". */
export class ImportJobTracker {
	constructor(private readonly supabaseClient: SupabaseClient) {}

	private async updateImportJob(
		importJobId: number,
		changes: ImportJobsUpdate
	): Promise<void> {
		const { error } = await this.supabaseClient
			.from('ImportJobs')
			.update(changes)
			.eq('id', importJobId);
		if (error) throw error;
	}

	/** Opens a job row for `ringingGroupId` and returns its id, for every later transition to key on. */
	async createImportJob(ringingGroupId: number): Promise<number> {
		const { data, error } = await this.supabaseClient
			.from('ImportJobs')
			.insert<ImportJobsInsert>({
				ringing_group_id: ringingGroupId,
				status: 'in_progress',
				started_at: new Date().toISOString(),
				day_stats_refresh_status: 'in_progress',
				month_stats_refresh_status: 'in_progress',
				year_stats_refresh_status: 'in_progress',
				month_squashed_stats_refresh_status: 'in_progress',
				all_time_stats_refresh_status: 'in_progress'
			})
			.select('id')
			.single();

		if (error) throw error;
		if (!data) throw new Error('Insert into ImportJobs returned no data');
		return data.id;
	}

	/** Records the distinct dates present in the imported batch, written mid-run. */
	async recordAffectedDates(
		importJobId: number,
		affectedDates: string[]
	): Promise<void> {
		await this.updateImportJob(importJobId, {
			affected_dates: [...new Set(affectedDates)].sort()
		});
	}

	/** Terminal: every row was processed and the run finished normally. */
	async completeImportJob(
		importJobId: number,
		{ processed, successful, failed }: ImportJobRowCounts
	): Promise<void> {
		await this.updateImportJob(importJobId, {
			status: 'succeeded',
			finished_at: new Date().toISOString(),
			rows_processed: processed,
			rows_successful: successful,
			rows_failed: failed
		});
	}

	/** Terminal: the run threw. Row counts are deliberately not recorded. */
	async failImportJob(
		importJobId: number,
		errorMessage: string
	): Promise<void> {
		await this.updateImportJob(importJobId, {
			status: 'failed',
			finished_at: new Date().toISOString(),
			error_message: errorMessage
		});
	}

	/** Terminal: the web route's 280s abort fired. */
	async markImportJobTimedOut(
		importJobId: number,
		partialProgress: {
			processed: number;
			startDate: string | null;
			endDate: string | null;
		}
	): Promise<void> {
		await this.updateImportJob(importJobId, {
			status: 'timed_out',
			finished_at: new Date().toISOString(),
			rows_processed: partialProgress.processed,
			start_date: partialProgress.startDate,
			end_date: partialProgress.endDate
		});
	}

	/** Records how one temporal unit's stats-cache refresh went, on that temporal unit's own column only. */
	async markStatsCacheRefreshed(
		importJobId: number,
		temporalUnit: StatsTemporalUnit,
		refreshOutcome: StatsCacheRefreshOutcome
	): Promise<void> {
		await this.updateImportJob(importJobId, {
			[STATS_CACHE_REFRESH_STATUS_COLUMNS[temporalUnit]]: refreshOutcome
		});
	}
}
