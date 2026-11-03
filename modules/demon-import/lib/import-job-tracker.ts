import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase.types';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import type { ImportJobRowCounts, StatsCacheRefreshOutcome } from '../types';

type ImportJobsInsert = Database['public']['Tables']['ImportJobs']['Insert'];
type ImportJobsUpdate = Database['public']['Tables']['ImportJobs']['Update'];

/**
 * Which `ImportJobs` column each temporal unit's refresh outcome lands on
 * (#1154). Keyed on the canonical, DB-enum-backed `StatsTemporalUnit` rather
 * than a fresh copy of the same five-value union: the column an outcome lands
 * on and the temporal unit `refreshSimpleStatsCache` was called with are the
 * same axis by construction, so they must not be able to drift apart.
 *
 * This axis replaced a `StatsCacheType = 'core' | 'biometrics' |
 * 'demographics'`, not as a rename but as a change of axis: the three
 * stats-type cache tables were replaced by the temporal-unit-shaped
 * `SimpleStatsCache` table (#1144; a sibling `ComplexStatsCache` existed
 * alongside it from #1147 until it was removed entirely), refreshed one
 * temporal unit per call, so a temporal unit is now the finest granularity at
 * which a refresh can succeed or fail.
 */
const STATS_CACHE_REFRESH_STATUS_COLUMNS: Record<StatsTemporalUnit, string> = {
	day: 'day_stats_refresh_status',
	month: 'month_stats_refresh_status',
	year: 'year_stats_refresh_status',
	'month-squashed': 'month_squashed_stats_refresh_status',
	'all-time': 'all_time_stats_refresh_status'
};

/**
 * Reads and writes the `ImportJobs` row tracking one import run.
 *
 * A class rather than the `create*` factory that `createRingSequenceLookup`/
 * `createRingSequenceLinker` above use: those each expose
 * one operation, whereas this exposes six variations on the same two-line
 * `.update(...).eq('id', …)` against the same table, which a class groups around the
 * shared `supabaseClient` and the shared `updateImportJob` plumbing without six
 * copies of either.
 *
 * Every operation is deliberately independent: recording one temporal unit's refresh
 * outcome never touches `status`, `affected_dates` or the other four temporal units'
 * columns, and vice versa. That separation is the whole point of the table — "the rows
 * all imported but the monthly stats never refreshed" has to stay visible rather than
 * collapsing into "import succeeded".
 *
 * The import job id is a per-call argument rather than constructor state, because
 * `createImportJob` is what mints it: one tracker opens the row and then drives every
 * later transition on it.
 */
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

	/**
	 * Opens a job row for `ringingGroupId` and returns its id, for every later
	 * transition to key on. `status`, `started_at` and the five per-temporal-unit
	 * refresh-status columns are written explicitly even though the table defaults
	 * all seven to the same values, so the opening state of a run is readable at the call site
	 * (and assertable) rather than implied by the schema. `started_at` has to be
	 * client-side anyway to stay consistent with `finished_at`, which no trigger
	 * sets.
	 */
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

	/**
	 * Records the distinct dates present in the imported batch. Written mid-run —
	 * once the staging rows exist but before domain-table import begins (#959) —
	 * so this is its own operation rather than part of any terminal transition,
	 * and it leaves `status` and the refresh-status columns alone. Deduplicated
	 * and sorted here so the caller can pass a per-row date straight through.
	 */
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

	/**
	 * Terminal: the run threw. Row counts are deliberately not recorded — an
	 * unhandled error leaves them unknown rather than merely incomplete.
	 */
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

	/**
	 * Terminal: the web route's 280s abort fired. Records exactly the partial
	 * progress the route already reports to the browser in its
	 * `ImportTimeoutMessage`, which until now was the only place it went.
	 */
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

	/**
	 * Records how one temporal unit's stats-cache refresh went, on that temporal
	 * unit's own column and nothing else. The caller is whatever runs the
	 * refresh — the queue consumer that calls `refreshSimpleStatsCache` per
	 * dispatched temporal-unit event
	 * (`app/api/queues/stats-cache-refresh-window/route.ts`, #1155); this only
	 * provides somewhere to record the outcome.
	 */
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
