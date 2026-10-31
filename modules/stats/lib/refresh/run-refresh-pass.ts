import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	RefreshSimpleStatsCacheParams,
	BasicSessionMetricsRow,
	BiometricsMetricsRow,
	BirdAgeMetricsRow,
	EncounterAgeMetricsRow
} from '../../types';
import { fetchGroupSessionDates } from './session-dates';
import { buildSimpleMetricRpcParamsList } from './rpc-params';
import { runStatsCacheDbCall } from './db-call-logging';
import { fetchMetricRows } from './fetch-metric-rows';
import {
	mergeSimpleMetricRows,
	filterToTouchedPeriods,
	filterToTouchedSpecies
} from './merge-metric-rows';
import {
	writeBySpeciesRows,
	writeAllSpeciesRows,
	deadLetterAnomalies
} from './write-cache-rows';

/**
 * Populates `SimpleStatsCache` (#1144, retrofitted by #1162), the
 * **period-local** half of the stats-cache split — write side for the four
 * read-only "metric-group" RPCs #1145/#1146/#1148/#1149 created
 * (`stats_cache_basic_session_metrics`, `stats_cache_biometrics_metrics`,
 * `stats_cache_bird_age_metrics`, `stats_cache_encounter_age_metrics`).
 *
 * Merges the metric RPCs' per-cell rows in TS, then writes them to the
 * cache's `*BySpecies` table with one native `supabase-js` `.upsert()` naming
 * that table's single unique constraint as its conflict target (#1169 split
 * the cache into a species and a non-species table precisely so there is
 * exactly one such constraint to name; see `"SimpleStatsCache".sql`). Also
 * dead-letters any cell it could not write to the `FailedStatsCacheRefreshes`
 * table (#1167), tagged with the `cache_table` the refresh was targeting.
 *
 * There used to be a sibling **lifetime-relative** half,
 * `refreshComplexStatsCache` → `ComplexStatsCache`/`ComplexStatsCacheBySpecies`
 * (#1147/#1150/#1151/#1169), whose production write call site had already
 * been disabled (commit `c36f4cc9`) before the cache and both tables were
 * removed entirely. If a lifetime-relative cache is ever needed again, mine
 * that history rather than re-deriving the narrowing rules from scratch.
 *
 * The queue consumer that calls this per dispatched temporal-unit event is
 * `app/api/queues/stats-cache-refresh-window/route.ts` (#1155) — this module
 * only refreshes one temporal unit per call, it does not loop over temporal
 * units itself.
 */

/**
 * Runs one `refreshSimpleStatsCache` pass — either the species-grouped one,
 * writing `SimpleStatsCacheBySpecies`, or the non-species-grouped one, writing
 * the all-species-combined `SimpleStatsCache` — for one `(groupId,
 * temporalUnit)` combination. `refreshSimpleStatsCache` runs this twice,
 * sequentially, once per `groupBySpecies` value; the two passes are otherwise
 * identical (same RPCs, same narrowing rule, same merge), differing only in
 * the `group_by_species` value sent to every metric RPC and which table the
 * merged result lands in.
 *
 * Every temporal unit but `all-time` narrows by `periods`, in two different
 * ways (see `buildSimpleMetricRpcParamsList`):
 *
 * - `day` calls each metric RPC once per batch `batchPeriodsBySessionDateSpan`
 *   produces — a preflight query (`fetchGroupSessionDates`) fetches the
 *   group's real `Sessions.visit_date` list so each batch's `from_date`/
 *   `to_date` window is bounded by real session-date span, not by touched-
 *   period count (a sparse `periods` list — e.g. a group's very first and
 *   very last session ever — would otherwise force one window spanning the
 *   entire history). Each batch's window can still return extra untouched
 *   days inside its own span, so the merged result is filtered down to just
 *   the periods actually touched before writing.
 * - `month`/`year`/`month-squashed` call each metric RPC once *per distinct
 *   period*, with that period's exact `year_filter`/`month_filter` and no
 *   window at all (#1176; `month-squashed` since #1178, by `month_filter`
 *   alone). Each call therefore returns only cells for a period this pass is
 *   refreshing, so the post-hoc filter has nothing left to drop.
 *
 * `all-time` always full-replaces the group's whole history, ignoring `periods`
 * entirely.
 *
 * Independently of the above, the `groupBySpecies: true` pass also narrows by
 * `speciesIds` when given (`filterToTouchedSpecies`), for every temporal unit
 * including `all-time` — see `RefreshSpeciesNarrowing`'s own doc comment. The
 * `groupBySpecies: false` pass never does: its one row per period aggregates
 * across every species, so it has to see every computed row regardless of
 * `speciesIds`.
 *
 * Writes go through one chunked sequence of `.upsert()` calls per pass — not
 * one per metric RPC's worth of rows and not one per fanned-out period, but
 * split into `DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE`-row calls when the pass's
 * row count exceeds that cap (`day` is the temporal unit most likely to, since
 * its row count scales with touched dates). See
 * `writeBySpeciesRows`/`writeAllSpeciesRows`.
 *
 * Any cell `mergeSimpleMetricRows` had to skip is then dead-lettered to
 * `FailedStatsCacheRefreshes` in one batched insert (#1167) — see
 * `deadLetterAnomalies`. The species-grouped pass dead-letters under
 * `cache_table: 'SimpleStatsCacheBySpecies'`, the non-species-grouped pass
 * under plain `'SimpleStatsCache'` (#1182), so an anomaly row tells you which
 * pass produced it.
 *
 * Known-accepted limitation: a species whose *entire* history disappears
 * falls out of `stats_spine`'s species-set entirely, so it never gets a
 * fresh row written to overwrite a stale one — an upsert can only ever
 * refresh cells the spine still produces. Out of scope for this ticket.
 *
 * The 4 metric RPC reads are each attempted regardless of whether an earlier
 * one failed, so a timeout investigation can see whether every one of them
 * is slow or just one — but any one of them failing still blocks the whole
 * merge/write phase for this pass; there's no such thing as a partial merge.
 * The `Sessions.visit_date` preflight above is the one exception: it has to
 * run and succeed *before* the 4 RPC calls' params can even be built for the
 * `day` unit, so there's nothing left to "still attempt" if it fails.
 */
export async function runSimpleStatsCacheRefreshPass(
	supabaseClient: SupabaseClient,
	{
		groupId,
		temporalUnit,
		periods,
		speciesIds,
		importJobId
	}: RefreshSimpleStatsCacheParams,
	groupBySpecies: boolean
): Promise<void> {
	const touchedPeriods = periods ?? [];
	const logContext = {
		importJobId,
		groupId,
		temporalUnit,
		groupBySpecies,
		periods,
		speciesIds
	};

	// Only the `day` unit's window-narrowing batching needs the group's real
	// session dates (see `batchPeriodsBySessionDateSpan`) — every other
	// temporal unit ignores this list entirely, so skip the query rather than
	// pay for it on every refresh pass. Fetched here (not in
	// `refreshSimpleStatsCache`) so `runSimpleStatsCacheRefreshPass`'s own
	// direct callers (e.g. `supabase/scripts/debug-stats-cache-refresh.ts`)
	// get the same batching without going through the wrapper — at the cost
	// of this query running twice per `refreshSimpleStatsCache` event (once
	// per `groupBySpecies` pass) rather than once; accepted as simpler than
	// threading a pre-fetched array through both functions' signatures for a
	// single cheap indexed-column scan.
	const groupSessionDates =
		temporalUnit === 'day' && touchedPeriods.length > 0
			? await runStatsCacheDbCall(
					{ kind: 'select', table: 'Sessions' },
					logContext,
					() => fetchGroupSessionDates(supabaseClient, groupId)
				)
			: [];

	const rpcParamsList = buildSimpleMetricRpcParamsList(
		groupId,
		temporalUnit,
		touchedPeriods,
		groupSessionDates,
		groupBySpecies
	);
	if (rpcParamsList === null) {
		// Narrowing temporal unit, nothing touched this pass — nothing to refresh.
		return;
	}
	// Each call below logs itself (name + its own params) inside
	// `fetchMetricRows` — see its own docblock for why that has to be at the
	// per-RPC-call granularity rather than wrapped once here.
	//
	// Each of the 4 metric RPCs is attempted regardless of whether an earlier
	// one failed — sequentially, in the same order as before, so this adds no
	// concurrent DB load — and every failure is collected rather than thrown
	// immediately, so a timeout in `basic` doesn't hide whether `biometrics`/
	// `birdAge`/`encounterAge` are also timing out. Once all 4 have been
	// attempted, any failure blocks the merge/write phase entirely: there's no
	// such thing as a partial merge when one metric's rows are missing.
	const readFailures: unknown[] = [];
	let basicRows: BasicSessionMetricsRow[] = [];
	let biometricsRows: BiometricsMetricsRow[] = [];
	let birdAgeRows: BirdAgeMetricsRow[] = [];
	let encounterAgeRows: EncounterAgeMetricsRow[] = [];

	try {
		basicRows = await fetchMetricRows<BasicSessionMetricsRow>(
			supabaseClient,
			'stats_cache_basic_session_metrics',
			rpcParamsList,
			logContext
		);
	} catch (error) {
		readFailures.push(error);
	}
	try {
		biometricsRows = await fetchMetricRows<BiometricsMetricsRow>(
			supabaseClient,
			'stats_cache_biometrics_metrics',
			rpcParamsList,
			logContext
		);
	} catch (error) {
		readFailures.push(error);
	}
	try {
		birdAgeRows = await fetchMetricRows<BirdAgeMetricsRow>(
			supabaseClient,
			'stats_cache_bird_age_metrics',
			rpcParamsList,
			logContext
		);
	} catch (error) {
		readFailures.push(error);
	}
	try {
		encounterAgeRows = await fetchMetricRows<EncounterAgeMetricsRow>(
			supabaseClient,
			'stats_cache_encounter_age_metrics',
			rpcParamsList,
			logContext
		);
	} catch (error) {
		readFailures.push(error);
	}

	if (readFailures.length > 0) {
		console.error(
			`Stats-cache refresh pass aborted: ${readFailures.length}/4 metric RPCs failed to read; blocking the cache write`,
			logContext
		);
		throw readFailures[0];
	}

	const { mergedRows, anomalies } = mergeSimpleMetricRows({
		groupId,
		temporalUnit,
		groupBySpecies,
		basicRows,
		biometricsRows,
		birdAgeRows,
		encounterAgeRows
	});

	// A no-op for `month`/`year` now that each of their calls is exact-filtered
	// (#1176) — enforces the invariant "a narrowing pass only ever writes
	// periods it was asked to refresh" at the write for every narrowing unit,
	// however its rows were fetched.
	const rowsToWrite = filterToTouchedPeriods(
		mergedRows,
		temporalUnit,
		touchedPeriods
	);

	// Each chunked `.upsert()` call logs itself (table + its own chunk's row
	// count) inside the writer functions — see their docblocks for why that
	// has to be at the per-chunk granularity rather than wrapped once here.
	if (groupBySpecies) {
		await writeBySpeciesRows(
			supabaseClient,
			'SimpleStatsCacheBySpecies',
			filterToTouchedSpecies(rowsToWrite, speciesIds),
			logContext
		);
	} else {
		await writeAllSpeciesRows(
			supabaseClient,
			'SimpleStatsCache',
			rowsToWrite,
			logContext
		);
	}

	await deadLetterAnomalies(supabaseClient, anomalies, logContext);
}

/**
 * Refreshes `SimpleStatsCache` for one `(groupId, temporalUnit)` combination —
 * both its species-grouped half (`SimpleStatsCacheBySpecies`) and its
 * all-species-combined half (`SimpleStatsCache`). One temporal unit per call —
 * a future queue consumer (T10) calls this once per temporal-unit event it
 * receives; this function does not loop over temporal units itself.
 *
 * The two passes run sequentially, not concurrently (`Promise.all`): this
 * module shares its six underlying RPCs with an active investigation into
 * RPC-timeout behaviour under load, so doubling concurrent calls for the same
 * group/temporal-unit isn't the right default here. If either pass throws,
 * this function rejects — same externally-visible failure semantics as
 * before this split, since the queue consumer's per-cache-table `try`/`catch`
 * and `*_stats_refresh_status` column don't distinguish which internal pass
 * failed.
 *
 * See `runSimpleStatsCacheRefreshPass` for what one pass actually does.
 */
export async function refreshSimpleStatsCache(
	supabaseClient: SupabaseClient,
	params: RefreshSimpleStatsCacheParams
): Promise<void> {
	await runSimpleStatsCacheRefreshPass(supabaseClient, params, true);
	await runSimpleStatsCacheRefreshPass(supabaseClient, params, false);
}
