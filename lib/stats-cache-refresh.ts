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
 * then write them to the cache's `*BySpecies` table with one native
 * `supabase-js` `.upsert()` naming that table's single unique constraint as
 * its conflict target (#1169 split each cache into a species and a non-species
 * table precisely so there is exactly one such constraint to name; see
 * `"SimpleStatsCache".sql`). Both also dead-letter any cell they could not
 * write to the shared `FailedStatsCacheRefreshes` table (#1167), tagged with
 * the `cache_table` the refresh was targeting.
 *
 * What differs between them is **which temporal units may narrow by affected
 * dates**, and that difference is the entire reason the two tables and the two
 * functions exist separately — see `SIMPLE_NARROWING_TEMPORAL_UNITS` and
 * `COMPLEX_NARROWING_TEMPORAL_UNITS` below.
 *
 * The queue consumer that calls these per dispatched temporal-unit event is
 * `app/api/queues/stats-cache-refresh-window/route.ts` (#1155) — this module
 * only refreshes one temporal unit per call, it does not loop over temporal
 * units itself.
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
	 * Required (non-empty) for the narrowing temporal units — `day`, `month`,
	 * `year` and, since #1178, `month-squashed` (whose periods are the
	 * `2000-MM-01` sentinel-year cells its grouping emits). See
	 * `buildSimpleMetricRpcParamsList`'s early-return for what happens if it's
	 * empty for one of those. Ignored entirely for `all-time`, which always
	 * full-replaces the whole group history regardless of what's passed.
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
 * The two columns every merged cell is keyed on, with the *metric RPCs'* own
 * nullability rather than the cache tables'. `cellKey`/`indexByCell` match a
 * cell across several RPC results on this pair, and the RPCs emit a real NULL
 * `time_period` for the all-time grain, so a merged cell has to keep that NULL
 * — `writeBySpeciesRows` is where it becomes the tables' sentinel date.
 */
type MergedCellKey = {
	species_id: number | null;
	time_period: string | null;
};

/**
 * One merged `SimpleStatsCache` cell, pre-write: the `SimpleStatsCacheBySpecies`
 * Insert shape minus the columns `writeBySpeciesRows` supplies itself
 * (`group_id`, `temporal_unit`), the one the database derives (`id`), and the
 * two key columns, re-added via `MergedCellKey` at the merge step's own
 * nullability.
 */
type SimpleMergedCell = Omit<
	Database['public']['Tables']['SimpleStatsCacheBySpecies']['Insert'],
	'id' | 'group_id' | 'temporal_unit' | keyof MergedCellKey
> &
	MergedCellKey;

/** The same, for `ComplexStatsCacheBySpecies`. */
type ComplexMergedCell = Omit<
	Database['public']['Tables']['ComplexStatsCacheBySpecies']['Insert'],
	'id' | 'group_id' | 'temporal_unit' | keyof MergedCellKey
> &
	MergedCellKey;

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
 * The `time_period` value the cache tables use for the all-time grain. Those
 * columns are NOT NULL so that a single plain UNIQUE constraint arbitrates
 * every grain and a native `.upsert()` can name it as a conflict target
 * (#1169), but the metric RPCs emit a real NULL for all-time — the two
 * conventions meet in `writeBySpeciesRows`. A genuinely out-of-domain date, not
 * a merely unlikely one: no ringing data comes anywhere near it.
 */
const ALL_TIME_SENTINEL_DATE = '0001-01-01';

/**
 * Both `*BySpecies` tables' sole unique constraint, as the bare column list
 * PostgREST's `onConflict` takes. Keep in sync **by hand** with
 * `simple_stats_cache_by_species_group_grain_period_species_key` and
 * `complex_stats_cache_by_species_grain_period_species_key` — see either
 * table's own schema file.
 */
const BY_SPECIES_CONFLICT_TARGET =
	'group_id,temporal_unit,time_period,species_id';

/**
 * The temporal units `refreshSimpleStatsCache` may narrow by affected dates —
 * every unit except `all-time`. Every `SimpleStatsCache` metric is
 * **period-local**: it reads only the encounters inside the cell's own period,
 * so narrowing is sound wherever a cell is selectable by the metric RPCs' own
 * filters. `all-time` spans everything, so it alone never narrows.
 *
 * `month-squashed` narrows too, as of #1178, even though its cells span every
 * year's copy of a calendar month: a squashed cell *is* exactly what
 * `month_filter` alone (no `year_filter`) selects, verified correct across all
 * years on PR #1177. What used to block it was `stats_spine`'s month-squashed
 * branch ignoring `month_filter` and always emitting all 12 calendar cells —
 * so the 11 untouched ones came back as zeroes and collided across
 * `buildSimpleMetricRpcParamsList`'s fan-out, breaking the disjoint-cell-key
 * invariant `fetchMetricRows` relies on. #1178 added the branch's
 * `month_filter` guard, which is what makes this entry sound.
 *
 * *How* each of the four narrows differs — `month`/`year`/`month-squashed` by
 * exact `year_filter`/`month_filter`, `day` by a date window — see
 * `buildSimpleMetricRpcParamsList`. This set is only about which units may
 * narrow at all.
 */
const SIMPLE_NARROWING_TEMPORAL_UNITS: ReadonlySet<TemporalUnit> = new Set([
	'day',
	'month',
	'year',
	'month-squashed'
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
	/** Exact calendar year, matched as `EXTRACT(YEAR FROM visit_date)`. */
	year_filter?: number;
	/** Exact calendar month, 1-12, matched as `EXTRACT(MONTH FROM visit_date)`. */
	month_filter?: number;
};

/** The temporal units `isExactFilterTemporalUnit` is true of. */
type ExactFilterTemporalUnit = 'month' | 'year' | 'month-squashed';

/**
 * Whether `refreshSimpleStatsCache` refreshes this temporal unit by exact-match
 * `year_filter`/`month_filter` rather than by a `from_date`/`to_date` window
 * (#1176, extended to `month-squashed` by #1178). True of
 * `month`/`year`/`month-squashed`: each of their periods is a whole calendar
 * month, a whole calendar year, or one calendar month across every year, which
 * is exactly what some combination of those two RPC params already selects — so
 * one call per distinct period is both narrower than any single window spanning
 * them and exact, with no untouched gap period coming back in the result to be
 * filtered out afterwards.
 *
 * False of `day`, the unit that keeps the window + `filterToTouchedPeriods`
 * pairing: the RPC family has no `day_filter`, and one `day` refresh pass
 * legitimately covers a non-contiguous set of days. False of `all-time`, which
 * never narrows at all. A type predicate rather than a plain boolean so its
 * caller gets the unit narrowed for `exactPeriodFilters` without a cast.
 */
function isExactFilterTemporalUnit(
	temporalUnit: TemporalUnit
): temporalUnit is ExactFilterTemporalUnit {
	return (
		temporalUnit === 'month' ||
		temporalUnit === 'year' ||
		temporalUnit === 'month-squashed'
	);
}

/**
 * The exact-match RPC filters selecting precisely the period a
 * `month`/`year`/`month-squashed` period string names —
 * `YYYY-MM-01`/`YYYY-01-01`/`2000-MM-01`, per
 * `lib/stats-cache-refresh-events.ts`'s `periodsTouched`. Each unit uses the
 * subset of the two filters that *is* its own period, and no more:
 *
 * - `year` needs no `month_filter` — the year filter alone is the whole period.
 * - `month-squashed` needs no `year_filter`, and must not have one: "every
 *   year's copy of this calendar month" is precisely `month_filter` with
 *   `year_filter` left NULL (#1178). Its period string's year component is the
 *   `2000` sentinel the squashed cells are labelled with, never a real year, so
 *   it is deliberately not read.
 */
function exactPeriodFilters(
	temporalUnit: ExactFilterTemporalUnit,
	periodString: string
): Pick<MetricRpcParams, 'year_filter' | 'month_filter'> {
	const month_filter = Number(periodString.slice(5, 7));
	if (temporalUnit === 'month-squashed') {
		return { month_filter };
	}
	const year_filter = Number(periodString.slice(0, 4));
	return temporalUnit === 'year' ? { year_filter } : { year_filter, month_filter };
}

/**
 * The parts of a metric RPC's filter object that are the same for every
 * temporal unit and every call of one refresh pass — the group, the
 * group-by-species flag every call in this module hardcodes, and the grain.
 */
function unwindowedMetricRpcParams(
	groupId: number,
	temporalUnit: TemporalUnit
): MetricRpcParams {
	return {
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
 *
 * Only ever reached with a *window*-narrowing temporal unit — `day`, for both
 * caches. `refreshSimpleStatsCache` peels `month`/`year` off into
 * `buildSimpleMetricRpcParamsList`'s exact-filter fan-out before calling this
 * (#1176), and `COMPLEX_NARROWING_TEMPORAL_UNITS` never contained them.
 */
function buildMetricRpcParams(
	groupId: number,
	temporalUnit: TemporalUnit,
	periods: string[],
	narrowingTemporalUnits: ReadonlySet<TemporalUnit>
): MetricRpcParams | null {
	const unwindowedParams = unwindowedMetricRpcParams(groupId, temporalUnit);

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

	// Both bounds are a period string verbatim: for the one unit that still
	// narrows by window — `day` — a period string already *is* a date, so it
	// is both its own first and its own last day. The `month`/`year` case this
	// used to extend to the end of `max(periods)`'s period (#1173) no longer
	// reaches here at all; it is exact-filtered instead (#1176).
	return {
		...unwindowedParams,
		from_date: minPeriod,
		to_date: maxPeriod
	};
}

/**
 * Every metric-RPC filter object one `refreshSimpleStatsCache` pass needs, in
 * call order — a list because `month`/`year`/`month-squashed` fan out to one
 * exact-filtered call per distinct touched period (#1176/#1178), while `day`
 * and `all-time` stay on the single object `buildMetricRpcParams` has always
 * produced.
 *
 * Returns `null` on the same "nothing to refresh" condition that function does:
 * a narrowing temporal unit with no touched periods.
 */
function buildSimpleMetricRpcParamsList(
	groupId: number,
	temporalUnit: TemporalUnit,
	periods: string[]
): MetricRpcParams[] | null {
	if (!isExactFilterTemporalUnit(temporalUnit)) {
		const windowedParams = buildMetricRpcParams(
			groupId,
			temporalUnit,
			periods,
			SIMPLE_NARROWING_TEMPORAL_UNITS
		);
		return windowedParams === null ? null : [windowedParams];
	}

	// A period can legitimately repeat in `periods` (several affected dates
	// inside one month collapse onto the same `YYYY-MM-01`, and for
	// `month-squashed` the same calendar month in two different years collapses
	// onto the same `2000-MM-01`), and calling the same exact filter twice would
	// just merge the identical cells back over themselves — so de-duplicate,
	// preserving first-seen order.
	const distinctPeriods = [...new Set(periods)];
	if (distinctPeriods.length === 0) {
		return null;
	}

	return distinctPeriods.map((periodString) => ({
		...unwindowedMetricRpcParams(groupId, temporalUnit),
		...exactPeriodFilters(temporalUnit, periodString)
	}));
}

/**
 * Calls one metric RPC once per filter object in `rpcParamsList`, concurrently,
 * and concatenates the rows. A single-element list is the ordinary one-call
 * case; `refreshSimpleStatsCache`'s `month`/`year`/`month-squashed` fan-out is
 * the many-element one. Concatenating before merging is safe because no two
 * periods' results ever share a `(species_id, time_period)` cell key, which is
 * all `indexByCell`/`mergeSimpleMetricRows` key on — for `month-squashed` that
 * holds only because `stats_spine`'s month-squashed branch honours
 * `month_filter` (#1178); before that every call returned all 12 cells.
 */
async function fetchMetricRows<Row>(
	supabaseClient: SupabaseClient,
	rpcName: string,
	rpcParamsList: MetricRpcParams[]
): Promise<Row[]> {
	const perCallRows = await Promise.all(
		rpcParamsList.map((rpcParams) =>
			supabaseClient.rpc(rpcName, rpcParams).then(catchSupabaseErrors)
		)
	);
	return perCallRows.flatMap((rows) => (rows ?? []) as Row[]);
}

/**
 * Cuts a merged result back to exactly the periods this pass is refreshing, for
 * a narrowing temporal unit. Load-bearing for the window-narrowed unit, `day`
 * (both caches): the `min(periods)`..`max(periods)` window
 * `buildMetricRpcParams` computes spans untouched gaps inside that range, so
 * the RPCs can legitimately return cells for periods that weren't touched —
 * those must not be rewritten. A pass-through for `refreshSimpleStatsCache`'s
 * exact-filtered `month`/`year`/`month-squashed` fan-out, whose calls cannot
 * return an untouched period in the first place (#1176/#1178). A non-narrowing
 * temporal unit full-replaces, so every merged row is kept.
 */
function filterToTouchedPeriods<Row extends MergedCellKey>(
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
			row.time_period !== null && touchedPeriods.includes(row.time_period)
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
 * refresh pass has no real data for: every cache-table metric column bar the
 * eight biometric ones is NOT NULL by design, specifically so no half-written/
 * placeholder row can ever land in either cache table, and faking a value here
 * in TS would defeat the point.
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
 * Writes one refresh pass's merged cells to its cache's `*BySpecies` table, in
 * a single native `.upsert()` against that table's one unique constraint.
 *
 * This is where the two `time_period` conventions are reconciled: the metric
 * RPCs emit a real NULL for the all-time grain, the cache column is NOT NULL,
 * so a null becomes `ALL_TIME_SENTINEL_DATE` here rather than in the merge —
 * which has to keep the NULL to match cells across RPC results by key.
 *
 * Only the `BySpecies` tables are ever written, and `species_id` is asserted
 * non-null for the same reason: every metric RPC call in this module hardcodes
 * `group_by_species: true`, so every cell carries a real species id. The
 * all-species-combined tables are schema-complete but have no writer.
 */
async function writeBySpeciesRows<Cell extends MergedCellKey>(
	supabaseClient: SupabaseClient,
	cacheTable: 'SimpleStatsCacheBySpecies' | 'ComplexStatsCacheBySpecies',
	cells: Cell[],
	{ groupId, temporalUnit }: { groupId: number; temporalUnit: TemporalUnit }
): Promise<void> {
	await supabaseClient
		.from(cacheTable)
		.upsert(
			cells.map(({ species_id, time_period, ...metrics }) => ({
				...metrics,
				group_id: groupId,
				temporal_unit: temporalUnit,
				species_id: species_id!,
				time_period: time_period ?? ALL_TIME_SENTINEL_DATE
			})),
			{ onConflict: BY_SPECIES_CONFLICT_TARGET }
		)
		.then(catchSupabaseErrors);
}

/**
 * Dead-letters the cells a merge pass had to skip, in one multi-row insert —
 * a plain insert rather than the `.upsert()` above: `FailedStatsCacheRefreshes`
 * has no uniqueness to arbitrate, so there is no conflict target to name.
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
 * one refresh pass covers exactly one of each, so `writeBySpeciesRows` adds
 * them once at the write rather than per cell here.
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
			// Passed straight through, NULL included — `writeBySpeciesRows` maps
			// the all-time grain's NULL onto the table's sentinel date at the
			// write, not here.
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
 * Every temporal unit but `all-time` narrows by `periods`, in two different
 * ways (see `buildSimpleMetricRpcParamsList`):
 *
 * - `day` calls each metric RPC once, over a `from_date`/`to_date` window
 *   spanning `min(periods)`..`max(periods)`, and the merged result is filtered
 *   down to just the periods actually touched before writing — that window can
 *   return extra untouched days inside the range.
 * - `month`/`year`/`month-squashed` call each metric RPC once *per distinct
 *   period*, with that period's exact `year_filter`/`month_filter` and no
 *   window at all (#1176; `month-squashed` since #1178, by `month_filter`
 *   alone). Each call therefore returns only cells for a period this pass is
 *   refreshing, so the post-hoc filter has nothing left to drop.
 *
 * `all-time` always full-replaces the group's whole history, ignoring `periods`
 * entirely.
 *
 * Writes go through exactly one `.upsert()` against `SimpleStatsCacheBySpecies`
 * — one call per invocation, not one per metric RPC's worth of rows and not one
 * per fanned-out period. See `writeBySpeciesRows`.
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

	const rpcParamsList = buildSimpleMetricRpcParamsList(
		groupId,
		temporalUnit,
		touchedPeriods
	);
	if (rpcParamsList === null) {
		// Narrowing temporal unit, nothing touched this pass — nothing to refresh.
		return;
	}

	const [basicRows, biometricsRows, birdAgeRows, encounterAgeRows] =
		await Promise.all([
			fetchMetricRows<BasicSessionMetricsRow>(
				supabaseClient,
				'stats_cache_basic_session_metrics',
				rpcParamsList
			),
			fetchMetricRows<BiometricsMetricsRow>(
				supabaseClient,
				'stats_cache_biometrics_metrics',
				rpcParamsList
			),
			fetchMetricRows<BirdAgeMetricsRow>(
				supabaseClient,
				'stats_cache_bird_age_metrics',
				rpcParamsList
			),
			fetchMetricRows<EncounterAgeMetricsRow>(
				supabaseClient,
				'stats_cache_encounter_age_metrics',
				rpcParamsList
			)
		]);

	const { mergedRows, anomalies } = mergeSimpleMetricRows({
		groupId,
		temporalUnit,
		basicRows,
		biometricsRows,
		birdAgeRows,
		encounterAgeRows
	});

	// A no-op for `month`/`year` now that each of their calls is exact-filtered
	// (#1176) — kept pointed at the full narrowing set rather than `day` alone
	// so the invariant "a narrowing pass only ever writes periods it was asked
	// to refresh" is enforced at the write for every narrowing unit, however
	// its rows were fetched.
	const rowsToWrite = filterToTouchedPeriods(
		mergedRows,
		temporalUnit,
		touchedPeriods,
		SIMPLE_NARROWING_TEMPORAL_UNITS
	);

	await writeBySpeciesRows(
		supabaseClient,
		'SimpleStatsCacheBySpecies',
		rowsToWrite,
		{ groupId, temporalUnit }
	);

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
 * Writes go through exactly one `.upsert()` against
 * `ComplexStatsCacheBySpecies` — one call per invocation, not one per metric
 * RPC's worth of rows. See `writeBySpeciesRows`.
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

	await writeBySpeciesRows(
		supabaseClient,
		'ComplexStatsCacheBySpecies',
		rowsToWrite,
		{ groupId, temporalUnit }
	);

	await deadLetterAnomalies(supabaseClient, anomalies);
}
