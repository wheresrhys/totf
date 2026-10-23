import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase.types';
// Relative, not `@/`-aliased, for the same reason `lib/demon-import.ts` and
// `lib/queue-dispatch.ts` import their own sibling modules relatively: these
// are value imports `lib/` needs at runtime (the CLI importer's `tsx` runner
// included), and `@/` alias resolution is scoped to tsconfig.json's
// `include`, which `lib/` sits outside of. The `@/`-aliased import above is
// `import type` only, erased before either runtime sees it, so it isn't
// subject to the same constraint.
import { catchSupabaseErrors } from './supabase';

/**
 * Populates both halves of the stats-cache split, one exported function per
 * table:
 *
 * - `refreshSimpleStatsCache` → `SimpleStatsCache` (#1144, retrofitted by
 *   #1162), the **period-local** half. Write side for the four read-only
 *   "metric-group" RPCs #1145/#1146/#1148/#1149 created
 *   (`stats_cache_basic_session_metrics`, `stats_cache_biometrics_metrics`,
 *   `stats_cache_bird_age_metrics`, `stats_cache_encounter_age_metrics`).
 * - `refreshComplexStatsCache` → `ComplexStatsCache` (#1147, retrofitted by
 *   #1162), the **lifetime-relative** half. Write side for the two read-only
 *   metric-group RPCs #1150/#1151 created (`stats_cache_new_adult_metrics`,
 *   `stats_cache_returning_age_metrics`).
 *
 * Both share the same shape — merge their metric RPCs' per-cell rows in TS,
 * then write through the table's dedicated `upsert_*_stats_cache_rows` RPC
 * rather than a native `supabase-js` `.upsert()`, because PostgREST's upsert
 * can only target a plain unique constraint by column list and each table's
 * four null-patterns need four partial indexes (see each upsert RPC's own file
 * for why). Both also dead-letter any cell they could not write to the shared
 * `FailedStatsCacheRefreshes` table (#1167), tagged with the `cache_table` the
 * refresh was targeting.
 *
 * What differs between them is **which temporal units may narrow by affected
 * dates**, and that difference is the entire reason the two tables and the two
 * functions exist separately — see `SIMPLE_NARROWING_TEMPORAL_UNITS` and
 * `COMPLEX_NARROWING_TEMPORAL_UNITS` below.
 *
 * The queue consumer that calls these per dispatched temporal-unit event is a
 * later ticket (T10) — this module only refreshes one temporal unit per call,
 * it does not loop over temporal units itself.
 */

/**
 * Matches `SimpleStatsCache.temporal_unit`'s CHECK constraint — same name and
 * value set as `supabase/__tests__/stats-cache-fixtures.ts`'s own
 * `TemporalUnit` (duplicated rather than imported: `lib/` doesn't reach into
 * `supabase/__tests__/`, a different zone's test-only fixtures).
 */
export type TemporalUnit =
	| 'day'
	| 'month'
	| 'year'
	| 'month-squashed'
	| 'all-time';

export type RefreshSimpleStatsCacheParams = {
	groupId: number;
	temporalUnit: TemporalUnit;
	/**
	 * The exact `time_period` values this refresh pass should write, in the
	 * same string shape the metric RPCs return for that temporal unit.
	 * Required (non-empty) for the narrow temporal units (`day`/`month`/
	 * `year`) — see `buildMetricRpcParams`'s early-return for what happens if
	 * it's empty there. Ignored entirely for `month-squashed`/`all-time`,
	 * which always full-replace the whole group history regardless of what's
	 * passed.
	 */
	periods?: string[];
};

export type RefreshComplexStatsCacheParams = {
	groupId: number;
	temporalUnit: TemporalUnit;
	/**
	 * The exact `time_period` values this refresh pass should write, in the
	 * same string shape the metric RPCs return for that temporal unit.
	 * Required (non-empty) for `day` — the only temporal unit this cache may
	 * narrow by. Ignored entirely for `month`/`year`/`month-squashed`/
	 * `all-time`, which always full-replace the whole group history regardless
	 * of what's passed (and which the caller is expected to leave `undefined`).
	 */
	periods?: string[];
};

type BasicSessionMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_basic_session_metrics_result'];
type BiometricsMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_biometrics_metrics_result'];
type BirdAgeMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_bird_age_metrics_result'];
type EncounterAgeMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_encounter_age_metrics_result'];
type NewAdultMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_new_adult_metrics_result'];
type ReturningAgeMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_returning_age_metrics_result'];

/**
 * The jsonb row shape `upsert_simple_stats_cache_rows` expects in `p_rows` —
 * `SimpleStatsCache`'s own Insert shape minus the columns the RPC takes as
 * separate scalar parameters (`group_id`, `temporal_unit`) or derives itself
 * (`id`).
 */
type SimpleMergedCell = Omit<
	Database['public']['Tables']['SimpleStatsCache']['Insert'],
	'id' | 'group_id' | 'temporal_unit'
>;

/** The same, for `upsert_complex_stats_cache_rows`/`ComplexStatsCache`. */
type ComplexMergedCell = Omit<
	Database['public']['Tables']['ComplexStatsCache']['Insert'],
	'id' | 'group_id' | 'temporal_unit'
>;

/**
 * One dead-letter row for `FailedStatsCacheRefreshes` (#1167) — a cell a
 * refresh pass could not write. `id`/`created_at` are database-defaulted.
 */
type FailedRefreshRow = Omit<
	Database['public']['Tables']['FailedStatsCacheRefreshes']['Insert'],
	'id' | 'created_at'
>;

/**
 * The one `FailedStatsCacheRefreshes.reason` value this module writes: the cell
 * was present in some but not all of the `stats_cache_*_metrics` RPC results.
 * The column is deliberately unconstrained text so a new failure kind needs no
 * migration — see that table's own column comment.
 */
const MISSING_FROM_METRIC_RPC = 'missing_from_metric_rpc';

/**
 * The temporal units `refreshSimpleStatsCache` may narrow by affected dates.
 * Every `SimpleStatsCache` metric is **period-local** — it reads only the
 * encounters inside the cell's own period — so narrowing is sound wherever a
 * cell maps onto one contiguous date window. `month-squashed` cells span every
 * year's copy of a month and `all-time` spans everything, so neither does.
 */
const SIMPLE_NARROWING_TEMPORAL_UNITS: ReadonlySet<TemporalUnit> = new Set([
	'day',
	'month',
	'year'
]);

/**
 * The temporal units `refreshComplexStatsCache` may narrow by affected dates —
 * `day` alone (#1153). Every `ComplexStatsCache` metric is
 * **lifetime-relative**: it reads a bird's whole *unwindowed* encounter history
 * to decide whether a cell's year is that bird's first-ever year, or what its
 * period-relative proven age is. A single backdated encounter anywhere in a
 * bird's history can therefore retroactively change a cell for some completely
 * different period than the one actually touched, so every temporal unit
 * coarser than `day` must always full-replace the group's whole history. `day`
 * is the one unit that narrows because it is also the only unit the dispatcher
 * carries an authoritative affected-date set for (see
 * `lib/stats-cache-refresh-events.ts` — `affectedDates` is restricted to the
 * day-range event).
 */
const COMPLEX_NARROWING_TEMPORAL_UNITS: ReadonlySet<TemporalUnit> = new Set([
	'day'
]);

/**
 * The shared 8-arg filter shape every `stats_cache_*_metrics` RPC takes
 * (mirrors `core_stats`'/`biometrics_stats`' own input signature — see
 * `app/lib/auth/group-summary-access.ts`'s `CoreStatsRpcParams` and
 * `app/lib/supabase/temporal-filter.ts`) — only the subset this function
 * ever needs to set.
 */
type MetricRpcParams = {
	ringing_group_filter: number;
	group_by_species: true;
	group_by_time_period?: 'day' | 'month' | 'year' | 'month-squashed';
	from_date?: string;
	to_date?: string;
};

/**
 * The last calendar day of the month a `month` period string (`YYYY-MM-01`)
 * names, as a `YYYY-MM-DD` string — handles every month length, leap Februarys
 * included, via `Date.UTC`'s day-0-of-next-month rollback rather than a
 * hand-rolled days-per-month table.
 */
function lastDayOfMonthPeriod(periodString: string): string {
	const year = Number(periodString.slice(0, 4));
	const month = Number(periodString.slice(5, 7)); // 1-12
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return `${periodString.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * 31 December of the year a `year` period string (`YYYY-01-01`) names, as a
 * `YYYY-MM-DD` string.
 */
function lastDayOfYearPeriod(periodString: string): string {
	return `${periodString.slice(0, 4)}-12-31`;
}

/**
 * Builds the shared filter object passed to every metric RPC of one cache's
 * single temporal-unit invocation. `narrowingTemporalUnits` is the calling
 * cache's own narrowing rule — `SIMPLE_NARROWING_TEMPORAL_UNITS` or
 * `COMPLEX_NARROWING_TEMPORAL_UNITS` — which is the only thing that differs
 * between the two callers.
 *
 * Returns `null` for a narrowing temporal unit with no touched periods — there
 * is no sensible `from_date`/`to_date` window to compute in that case, and
 * nothing would be narrowed by it anyway, so the caller treats that as
 * "nothing to refresh" rather than falling back to an unbounded, effectively
 * all-time call under narrow semantics.
 */
function buildMetricRpcParams(
	groupId: number,
	temporalUnit: TemporalUnit,
	periods: string[],
	narrowingTemporalUnits: ReadonlySet<TemporalUnit>
): MetricRpcParams | null {
	const unwindowedParams: MetricRpcParams = {
		ringing_group_filter: groupId,
		group_by_species: true,
		// For all-time, `group_by_time_period` is omitted completely rather than
		// set to any value — the same "omit the key for all-time" convention
		// `app/actions/summary-stats.ts`'s `fetchSummaryStats` and
		// `lib/stats-cache-refresh-events.ts`'s all-time event use.
		...(temporalUnit === 'all-time'
			? {}
			: { group_by_time_period: temporalUnit })
	};

	if (!narrowingTemporalUnits.has(temporalUnit)) {
		// Always full-replace, over the group's whole history (no from_date/
		// to_date), with the `periods` argument ignored entirely.
		return unwindowedParams;
	}

	if (periods.length === 0) {
		return null;
	}

	// `yyyy-MM-dd`-shaped period strings sort lexicographically in date order
	// (same convention as `app/lib/supabase/temporal-filter.ts`'s
	// `laterDateBound`/`earlierDateBound`), so min/max is a plain sort.
	const sortedPeriods = [...periods].sort();
	const minPeriod = sortedPeriods[0];
	const maxPeriod = sortedPeriods[sortedPeriods.length - 1];

	// `from_date` is always `min(periods)` verbatim — a period string is
	// already its own first day, for every temporal unit this function
	// narrows by. `to_date`, however, must cover the *whole* period
	// `max(periods)` names, not just its first day: for `day`, a period
	// string already *is* a date, so `max(periods)` unchanged is correct; for
	// `month`/`year`, a period string is only the period's first day
	// (`YYYY-MM-01`/`YYYY-01-01`, per `lib/stats-cache-refresh-events.ts`'s
	// `periodsTouched`), so using it verbatim as `to_date` collapsed the
	// window to a single day and the metric RPCs returned zero rows for every
	// import that didn't happen to touch the 1st of the month/year (#1173).
	const toDate =
		temporalUnit === 'month'
			? lastDayOfMonthPeriod(maxPeriod)
			: temporalUnit === 'year'
				? lastDayOfYearPeriod(maxPeriod)
				: maxPeriod;

	return {
		...unwindowedParams,
		from_date: minPeriod,
		to_date: toDate
	};
}

/**
 * Cuts a merged result back to exactly the periods this pass is refreshing,
 * for a narrowing temporal unit. The window `buildMetricRpcParams` computes —
 * `min(periods)` through the end of the period `max(periods)` names — spans
 * untouched gaps inside that range, so the RPCs can legitimately return cells
 * for periods that weren't touched — those must not be rewritten. A
 * non-narrowing temporal unit full-replaces, so every merged row is kept.
 */
function filterToTouchedPeriods<
	// Optional, not `string | null`: the merged-cell types are derived from the
	// cache tables' `Insert` shapes, where a nullable column is also optional —
	// so the real argument types carry `undefined` as well as `null`.
	Row extends { time_period?: string | null }
>(
	mergedRows: Row[],
	temporalUnit: TemporalUnit,
	touchedPeriods: string[],
	narrowingTemporalUnits: ReadonlySet<TemporalUnit>
): Row[] {
	if (!narrowingTemporalUnits.has(temporalUnit)) {
		return mergedRows;
	}
	return mergedRows.filter(
		(row) =>
			typeof row.time_period === 'string' &&
			touchedPeriods.includes(row.time_period)
	);
}

function cellKey(speciesId: number | null, timePeriod: string | null): string {
	return `${speciesId ?? 'null'}::${timePeriod ?? 'null'}`;
}

function indexByCell<
	Row extends { species_id: number | null; time_period: string | null }
>(rows: Row[]): Map<string, Row> {
	const index = new Map<string, Row>();
	for (const row of rows) {
		index.set(cellKey(row.species_id, row.time_period), row);
	}
	return index;
}

/**
 * Records a cell that appeared in some but not all of a refresh's metric RPC
 * results. Every RPC of a given cache shares the same `stats_spine` call, so a
 * cell key present in one but absent from another is an anomaly, not an
 * expected gap (discussed and settled on PR #1164's review) — the cell is
 * logged with enough context to act on and then skipped entirely, leaving
 * whatever is already cached for it untouched.
 *
 * The `console.error` stays for immediate visibility; the returned row is the
 * durable record, dead-lettered to `FailedStatsCacheRefreshes` (#1167). It is
 * *returned* rather than written here so both merge functions stay synchronous
 * and pure, with no Supabase client of their own — each refresh function, which
 * already holds the client, writes its whole batch in one insert once merging
 * has finished.
 *
 * Never zero-fill, NULL-fill, or otherwise invent a value for a column a
 * refresh pass has no real data for: both `upsert_*_stats_cache_rows` RPCs
 * require a fully-populated row by design specifically so no half-written/
 * placeholder row can ever land in either cache table, and replicating that
 * gap here in TS would defeat the point.
 */
function recordMissingCellAnomaly({
	groupId,
	cacheTable,
	temporalUnit,
	cellKey: key,
	missingFromRpc
}: {
	groupId: number;
	cacheTable: 'SimpleStatsCache' | 'ComplexStatsCache';
	temporalUnit: TemporalUnit;
	cellKey: string;
	missingFromRpc: string[];
}): FailedRefreshRow {
	const [rawSpeciesId, rawTimePeriod] = key.split('::');
	const speciesId = rawSpeciesId === 'null' ? null : Number(rawSpeciesId);
	const timePeriod = rawTimePeriod === 'null' ? null : rawTimePeriod;
	console.error(
		'A cell is missing from one or more stats_cache_*_metrics RPC results; skipping it this refresh pass and leaving whatever is already cached for it untouched',
		{
			groupId,
			cacheTable,
			temporalUnit,
			speciesId,
			timePeriod,
			missingFromRpc
		}
	);
	return {
		group_id: groupId,
		cache_table: cacheTable,
		temporal_unit: temporalUnit,
		species_id: speciesId,
		time_period: timePeriod,
		reason: MISSING_FROM_METRIC_RPC,
		details: { missingFromRpc }
	};
}

/**
 * Dead-letters the cells a merge pass had to skip, in one multi-row insert —
 * a plain PostgREST insert, not an RPC: `FailedStatsCacheRefreshes` has no
 * uniqueness to arbitrate, so nothing needs the custom-upsert treatment the two
 * cache tables need.
 *
 * Called *after* the cache write in both refresh functions: a failure recording
 * the anomaly must never cost us the rest of the refresh, which has already
 * landed by that point. Deliberately NOT narrowed to `touchedPeriods` the way
 * the written rows are — a cell missing from one metric RPC is a real data
 * anomaly whichever period it sits in, and keeping the table's contents
 * identical to what was logged is one fewer discrepancy to reason about when
 * reading it back.
 */
async function deadLetterAnomalies(
	supabaseClient: SupabaseClient,
	anomalies: FailedRefreshRow[]
): Promise<void> {
	if (anomalies.length === 0) {
		return;
	}
	await supabaseClient
		.from('FailedStatsCacheRefreshes')
		.insert(anomalies)
		.then(catchSupabaseErrors);
}

type MergeMetricRowsParams = {
	groupId: number;
	temporalUnit: TemporalUnit;
	basicRows: BasicSessionMetricsRow[];
	biometricsRows: BiometricsMetricsRow[];
	birdAgeRows: BirdAgeMetricsRow[];
	encounterAgeRows: EncounterAgeMetricsRow[];
};

/**
 * Merges the four `SimpleStatsCache` metric RPCs' per-cell rows, keyed by
 * `(species_id, time_period)`, into that table's full column set. All four
 * share the same `stats_spine` call, so every cell key should appear in every
 * RPC's result — a cell key present in some but not all four is skipped,
 * logged, and returned as an anomaly for the caller to dead-letter (see
 * `recordMissingCellAnomaly`). Every OTHER cell in the batch is unaffected —
 * one anomalous cell never drops the rest of the refresh.
 */
function mergeSimpleMetricRows({
	groupId,
	temporalUnit,
	basicRows,
	biometricsRows,
	birdAgeRows,
	encounterAgeRows
}: MergeMetricRowsParams): {
	mergedRows: SimpleMergedCell[];
	anomalies: FailedRefreshRow[];
} {
	const basicByCell = indexByCell(basicRows);
	const biometricsByCell = indexByCell(biometricsRows);
	const birdAgeByCell = indexByCell(birdAgeRows);
	const encounterAgeByCell = indexByCell(encounterAgeRows);

	const allCellKeys = new Set<string>([
		...basicByCell.keys(),
		...biometricsByCell.keys(),
		...birdAgeByCell.keys(),
		...encounterAgeByCell.keys()
	]);

	const mergedRows: SimpleMergedCell[] = [];
	const anomalies: FailedRefreshRow[] = [];

	for (const key of allCellKeys) {
		const basic = basicByCell.get(key);
		const biometrics = biometricsByCell.get(key);
		const birdAge = birdAgeByCell.get(key);
		const encounterAge = encounterAgeByCell.get(key);

		if (!basic || !biometrics || !birdAge || !encounterAge) {
			const missingFromRpc: string[] = [];
			if (!basic) missingFromRpc.push('stats_cache_basic_session_metrics');
			if (!biometrics) missingFromRpc.push('stats_cache_biometrics_metrics');
			if (!birdAge) missingFromRpc.push('stats_cache_bird_age_metrics');
			if (!encounterAge) {
				missingFromRpc.push('stats_cache_encounter_age_metrics');
			}
			anomalies.push(
				recordMissingCellAnomaly({
					groupId,
					cacheTable: 'SimpleStatsCache',
					temporalUnit,
					cellKey: key,
					missingFromRpc
				})
			);
			continue;
		}

		mergedRows.push({
			species_id: basic.species_id,
			time_period: basic.time_period,
			// The metric RPCs' composite return types mark every column
			// nullable (Postgres composite types carry no NOT NULL metadata),
			// but each of these specific columns is COALESCEd to a real value
			// in SQL — see each RPC's own schema file. The assertions below
			// trust that SQL-level guarantee rather than re-deriving it here.
			species_count: basic.species_count!,
			bird_count: basic.bird_count!,
			encounter_count: basic.encounter_count!,
			new_bird_count: basic.new_bird_count!,
			session_count: basic.session_count!,
			total_effort: basic.total_effort!,
			effort_per_session: basic.effort_per_session!,
			effort_per_encounter: basic.effort_per_encounter!,
			avg_encounters_per_session: basic.avg_encounters_per_session!,
			max_per_session: basic.max_per_session!,
			max_new_per_session: basic.max_new_per_session!,
			// Biometric columns are deliberately left nullable — an empty cell
			// has no value at all, matching biometrics_stats' own behaviour.
			max_weight: biometrics.max_weight,
			avg_weight: biometrics.avg_weight,
			min_weight: biometrics.min_weight,
			median_weight: biometrics.median_weight,
			max_wing: biometrics.max_wing,
			avg_wing: biometrics.avg_wing,
			min_wing: biometrics.min_wing,
			median_wing: biometrics.median_wing,
			pullus_bird_count: birdAge.pullus_bird_count!,
			juv_bird_count: birdAge.juv_bird_count!,
			postjuv_bird_count: birdAge.postjuv_bird_count!,
			adult_bird_count: birdAge.adult_bird_count!,
			unknown_age_bird_count: birdAge.unknown_age_bird_count!,
			new_young_bird_count: birdAge.new_young_bird_count!,
			pullus_enc_count: encounterAge.pullus_enc_count!,
			juv_enc_count: encounterAge.juv_enc_count!,
			postjuv_enc_count: encounterAge.postjuv_enc_count!,
			adult_enc_count: encounterAge.adult_enc_count!,
			unknown_age_enc_count: encounterAge.unknown_age_enc_count!,
			postjuv_juv_enc_count: encounterAge.postjuv_juv_enc_count!,
			new_postjuv_juv_enc_count: encounterAge.new_postjuv_juv_enc_count!,
			new_postjuv_enc_count: encounterAge.new_postjuv_enc_count!
		});
	}

	return { mergedRows, anomalies };
}

type MergeComplexMetricRowsParams = {
	groupId: number;
	temporalUnit: TemporalUnit;
	newAdultRows: NewAdultMetricsRow[];
	returningAgeRows: ReturningAgeMetricsRow[];
};

/**
 * Merges the two `ComplexStatsCache` metric RPCs' per-cell rows, keyed by
 * `(species_id, time_period)`, into that table's full column set. Their data
 * columns are disjoint — `stats_cache_new_adult_metrics` contributes
 * `new_adult_bird_count`, `stats_cache_returning_age_metrics` the four
 * `returning_*` columns — and both share the same `stats_spine` call, so every
 * cell key should appear in both results. A cell key present in one but not
 * the other is skipped, logged, and returned as an anomaly for the caller to
 * dead-letter (see `recordMissingCellAnomaly`); every OTHER cell in the batch
 * is unaffected.
 *
 * `group_id` and `temporal_unit` are deliberately absent from the merged rows:
 * `upsert_complex_stats_cache_rows` takes those as scalar parameters, and one
 * call carries exactly one null-pattern.
 */
function mergeComplexMetricRows({
	groupId,
	temporalUnit,
	newAdultRows,
	returningAgeRows
}: MergeComplexMetricRowsParams): {
	mergedRows: ComplexMergedCell[];
	anomalies: FailedRefreshRow[];
} {
	const newAdultByCell = indexByCell(newAdultRows);
	const returningAgeByCell = indexByCell(returningAgeRows);

	const allCellKeys = new Set<string>([
		...newAdultByCell.keys(),
		...returningAgeByCell.keys()
	]);

	const mergedRows: ComplexMergedCell[] = [];
	const anomalies: FailedRefreshRow[] = [];

	for (const key of allCellKeys) {
		const newAdult = newAdultByCell.get(key);
		const returningAge = returningAgeByCell.get(key);

		if (!newAdult || !returningAge) {
			const missingFromRpc: string[] = [];
			if (!newAdult) missingFromRpc.push('stats_cache_new_adult_metrics');
			if (!returningAge) {
				missingFromRpc.push('stats_cache_returning_age_metrics');
			}
			anomalies.push(
				recordMissingCellAnomaly({
					groupId,
					cacheTable: 'ComplexStatsCache',
					temporalUnit,
					cellKey: key,
					missingFromRpc
				})
			);
			continue;
		}

		mergedRows.push({
			species_id: newAdult.species_id,
			// Passed straight through — since #1162 `time_period` is nullable and
			// NULL *is* the all-time value, so there is no sentinel to map to.
			time_period: newAdult.time_period,
			// Same SQL-level guarantee the simple merge's assertions rely on: the
			// metric RPCs' composite return types mark every column nullable
			// (Postgres composite types carry no NOT NULL metadata), but all five
			// of these are COALESCEd to 0 in SQL — see each RPC's own schema file.
			new_adult_bird_count: newAdult.new_adult_bird_count!,
			returning_age_1_bird_count: returningAge.returning_age_1_bird_count!,
			returning_age_2_bird_count: returningAge.returning_age_2_bird_count!,
			returning_age_3_plus_bird_count:
				returningAge.returning_age_3_plus_bird_count!,
			returning_new_unknown_age_bird_count:
				returningAge.returning_new_unknown_age_bird_count!
		});
	}

	return { mergedRows, anomalies };
}

/**
 * Refreshes `SimpleStatsCache` for one `(groupId, temporalUnit)` combination.
 * One temporal unit per call — a future queue consumer (T10) calls this once
 * per temporal-unit event it receives; this function does not loop over
 * temporal units itself.
 *
 * `day`/`month`/`year` narrow by `periods`: the metric RPCs are called over
 * a `from_date`/`to_date` window spanning `min(periods)` through the end of
 * the period `max(periods)` names (the whole last day for `day`, the whole
 * last month for `month`, the whole last year for `year` — see
 * `buildMetricRpcParams`), and the merged result is filtered down to just
 * the periods actually touched before writing — the window call can return
 * extra untouched periods inside that range.
 *
 * `month-squashed`/`all-time` always full-replace the group's whole history,
 * ignoring `periods` entirely.
 *
 * Writes go through exactly one `upsert_simple_stats_cache_rows` call — never
 * a native `.upsert()` (see that RPC's own file for why) and never more than
 * one call per metric RPC's worth of rows.
 *
 * Any cell `mergeSimpleMetricRows` had to skip is then dead-lettered to
 * `FailedStatsCacheRefreshes` in one batched insert (#1167) — see
 * `deadLetterAnomalies`.
 *
 * Known-accepted limitation: a species whose *entire* history disappears
 * falls out of `stats_spine`'s species-set entirely, so it never gets a
 * fresh row written to overwrite a stale one — an upsert can only ever
 * refresh cells the spine still produces. Out of scope for this ticket.
 */
export async function refreshSimpleStatsCache(
	supabaseClient: SupabaseClient,
	{ groupId, temporalUnit, periods }: RefreshSimpleStatsCacheParams
): Promise<void> {
	const touchedPeriods = periods ?? [];

	const rpcParams = buildMetricRpcParams(
		groupId,
		temporalUnit,
		touchedPeriods,
		SIMPLE_NARROWING_TEMPORAL_UNITS
	);
	if (rpcParams === null) {
		// Narrowing temporal unit, nothing touched this pass — nothing to refresh.
		return;
	}

	const [basicRows, biometricsRows, birdAgeRows, encounterAgeRows] =
		await Promise.all([
			supabaseClient
				.rpc('stats_cache_basic_session_metrics', rpcParams)
				.then(catchSupabaseErrors),
			supabaseClient
				.rpc('stats_cache_biometrics_metrics', rpcParams)
				.then(catchSupabaseErrors),
			supabaseClient
				.rpc('stats_cache_bird_age_metrics', rpcParams)
				.then(catchSupabaseErrors),
			supabaseClient
				.rpc('stats_cache_encounter_age_metrics', rpcParams)
				.then(catchSupabaseErrors)
		]);

	const { mergedRows, anomalies } = mergeSimpleMetricRows({
		groupId,
		temporalUnit,
		basicRows: (basicRows ?? []) as BasicSessionMetricsRow[],
		biometricsRows: (biometricsRows ?? []) as BiometricsMetricsRow[],
		birdAgeRows: (birdAgeRows ?? []) as BirdAgeMetricsRow[],
		encounterAgeRows: (encounterAgeRows ?? []) as EncounterAgeMetricsRow[]
	});

	const rowsToWrite = filterToTouchedPeriods(
		mergedRows,
		temporalUnit,
		touchedPeriods,
		SIMPLE_NARROWING_TEMPORAL_UNITS
	);

	await supabaseClient
		.rpc('upsert_simple_stats_cache_rows', {
			p_group_id: groupId,
			p_temporal_unit: temporalUnit,
			p_group_by_species: true,
			p_rows: rowsToWrite
		})
		.then(catchSupabaseErrors);

	await deadLetterAnomalies(supabaseClient, anomalies);
}

/**
 * Refreshes `ComplexStatsCache` for one `(groupId, temporalUnit)` combination.
 * One temporal unit per call — a future queue consumer (T10) calls this once
 * per temporal-unit event it receives, alongside `refreshSimpleStatsCache`;
 * this function does not loop over temporal units itself.
 *
 * `day` is the only temporal unit that narrows by `periods`: the two metric
 * RPCs are called over a `from_date`/`to_date` window spanning
 * `min(periods)`..`max(periods)`, and the merged result is filtered down to
 * just the periods actually touched before writing — the window call can
 * return extra untouched periods inside that range.
 *
 * `month`/`year`/`month-squashed`/`all-time` always full-replace the group's
 * whole history, ignoring `periods` entirely. That stricter rule — not shared
 * with `refreshSimpleStatsCache`, whose metrics are period-local — is the whole
 * reason this cache is a separate table and this a separate function; see
 * `COMPLEX_NARROWING_TEMPORAL_UNITS`.
 *
 * Writes go through exactly one `upsert_complex_stats_cache_rows` call — never
 * a native `.upsert()` (see that RPC's own file for why) and never more than
 * one call per metric RPC's worth of rows.
 *
 * Any cell `mergeComplexMetricRows` had to skip is then dead-lettered to
 * `FailedStatsCacheRefreshes` in one batched insert (#1167), with
 * `cache_table = 'ComplexStatsCache'` distinguishing it from
 * `refreshSimpleStatsCache`'s rows in the same table — see
 * `deadLetterAnomalies`.
 *
 * Known-accepted limitation (shared with `refreshSimpleStatsCache`): a species
 * whose *entire* history disappears falls out of `stats_spine`'s species-set
 * entirely, so it never gets a fresh row written to overwrite a stale one — an
 * upsert can only ever refresh cells the spine still produces. Out of scope.
 */
export async function refreshComplexStatsCache(
	supabaseClient: SupabaseClient,
	{ groupId, temporalUnit, periods }: RefreshComplexStatsCacheParams
): Promise<void> {
	const touchedPeriods = periods ?? [];

	const rpcParams = buildMetricRpcParams(
		groupId,
		temporalUnit,
		touchedPeriods,
		COMPLEX_NARROWING_TEMPORAL_UNITS
	);
	if (rpcParams === null) {
		// Day temporal unit, nothing touched this pass — nothing to refresh.
		return;
	}

	const [newAdultRows, returningAgeRows] = await Promise.all([
		supabaseClient
			.rpc('stats_cache_new_adult_metrics', rpcParams)
			.then(catchSupabaseErrors),
		supabaseClient
			.rpc('stats_cache_returning_age_metrics', rpcParams)
			.then(catchSupabaseErrors)
	]);

	const { mergedRows, anomalies } = mergeComplexMetricRows({
		groupId,
		temporalUnit,
		newAdultRows: (newAdultRows ?? []) as NewAdultMetricsRow[],
		returningAgeRows: (returningAgeRows ?? []) as ReturningAgeMetricsRow[]
	});

	const rowsToWrite = filterToTouchedPeriods(
		mergedRows,
		temporalUnit,
		touchedPeriods,
		COMPLEX_NARROWING_TEMPORAL_UNITS
	);

	await supabaseClient
		.rpc('upsert_complex_stats_cache_rows', {
			p_group_id: groupId,
			p_temporal_unit: temporalUnit,
			p_group_by_species: true,
			p_rows: rowsToWrite
		})
		.then(catchSupabaseErrors);

	await deadLetterAnomalies(supabaseClient, anomalies);
}
