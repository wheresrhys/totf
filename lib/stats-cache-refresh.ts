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

/**
 * The species ids a refresh pass should narrow its species-grouped *write* to
 * — never its read: every metric RPC call is still made exactly as it is
 * without this field, over every species. When provided, only the
 * species-grouped write (`SimpleStatsCacheBySpecies`) skips rewriting a cell
 * whose `species_id` isn't in this list; the all-species-combined write
 * (`SimpleStatsCache`) ignores it entirely, since that row aggregates across
 * every species and must always
 * be rewritten in full whenever its period is in scope. `undefined` means "no
 * species narrowing" — every computed row is written, the pre-existing
 * behaviour. Orthogonal to `periods`/temporal-unit narrowing, and sound for
 * every temporal unit including `all-time`: an untouched species' cell for a
 * period in scope is unchanged by this import, so skipping its write
 * reproduces whatever is already cached for it.
 */
export type RefreshSpeciesNarrowing = {
	speciesIds?: number[];
};

export type RefreshSimpleStatsCacheParams = RefreshSpeciesNarrowing & {
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
	/**
	 * The import job this refresh was dispatched for, carried only for
	 * `runStatsCacheDbCall`'s failure-log context — not read by any refresh
	 * logic itself. Optional since most callers (every test, the debug
	 * script) have no import job at all.
	 */
	importJobId?: number;
};

type BasicSessionMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_basic_session_metrics_result'];
type BiometricsMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_biometrics_metrics_result'];
type BirdAgeMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_bird_age_metrics_result'];
type EncounterAgeMetricsRow =
	Database['public']['CompositeTypes']['stats_cache_encounter_age_metrics_result'];

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

/**
 * The two `cache_table` tags `FailedStatsCacheRefreshes`' CHECK constraint
 * accepts (#1182) — one per species-grouped-or-not pass, so an anomaly row
 * records which of the two refresh passes produced it.
 */
type FailedRefreshCacheTable = 'SimpleStatsCache' | 'SimpleStatsCacheBySpecies';

/**
 * One dead-letter row for `FailedStatsCacheRefreshes` (#1167) — a cell a
 * refresh pass could not write. `id`/`created_at` are database-defaulted.
 * `cache_table` is narrowed from the generated `Insert` type's bare `string`
 * (the column is text + CHECK, not a Postgres enum) to the four-value union
 * above.
 */
type FailedRefreshRow = Omit<
	Database['public']['Tables']['FailedStatsCacheRefreshes']['Insert'],
	'id' | 'created_at' | 'cache_table'
> & {
	cache_table: FailedRefreshCacheTable;
};

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
 * `SimpleStatsCacheBySpecies`' sole unique constraint, as the bare column list
 * PostgREST's `onConflict` takes. Keep in sync **by hand** with
 * `simple_stats_cache_by_species_group_grain_period_species_key` — see that
 * table's own schema file.
 */
const BY_SPECIES_CONFLICT_TARGET =
	'group_id,temporal_unit,time_period,species_id';

/**
 * `SimpleStatsCache`'s sole unique constraint —
 * `simple_stats_cache_group_grain_period_key`, see that table's own schema
 * file. One fewer column than `BY_SPECIES_CONFLICT_TARGET`: this table has
 * no `species_id` column at all.
 */
const ALL_SPECIES_CONFLICT_TARGET = 'group_id,temporal_unit,time_period';

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
 * The shared 8-arg filter shape every `stats_cache_*_metrics` RPC takes
 * (mirrors `core_stats`'/`biometrics_stats`' own input signature — see
 * `app/lib/auth/group-summary-access.ts`'s `CoreStatsRpcParams` and
 * `app/lib/supabase/temporal-filter.ts`) — only the subset this function
 * ever needs to set.
 */
type MetricRpcParams = {
	ringing_group_filter: number;
	group_by_species: boolean;
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
	return temporalUnit === 'year'
		? { year_filter }
		: { year_filter, month_filter };
}

/**
 * The parts of a metric RPC's filter object that are the same for every
 * temporal unit and every call of one refresh pass — the group, the
 * group-by-species flag the caller's pass is running under, and the grain.
 */
function unwindowedMetricRpcParams(
	groupId: number,
	temporalUnit: TemporalUnit,
	groupBySpecies: boolean
): MetricRpcParams {
	return {
		ringing_group_filter: groupId,
		group_by_species: groupBySpecies,
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
	narrowingTemporalUnits: ReadonlySet<TemporalUnit>,
	groupBySpecies: boolean
): MetricRpcParams | null {
	const unwindowedParams = unwindowedMetricRpcParams(
		groupId,
		temporalUnit,
		groupBySpecies
	);

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
	periods: string[],
	groupBySpecies: boolean
): MetricRpcParams[] | null {
	if (!isExactFilterTemporalUnit(temporalUnit)) {
		const windowedParams = buildMetricRpcParams(
			groupId,
			temporalUnit,
			periods,
			SIMPLE_NARROWING_TEMPORAL_UNITS,
			groupBySpecies
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
		...unwindowedMetricRpcParams(groupId, temporalUnit, groupBySpecies),
		...exactPeriodFilters(temporalUnit, periodString)
	}));
}

/**
 * Runs one DB call inside a `refreshSimpleStatsCache` pass, logging exactly
 * which call failed plus the whole pass's refresh context before letting the
 * original error propagate **unchanged** — same object, same message, so
 * `catchSupabaseErrors`'s own message and any `rejects.toThrow(...)` test
 * keep working untouched. A bare `catchSupabaseErrors` error on its own names
 * neither which of the 6 DB touchpoints in a pass failed nor which pass
 * (`groupBySpecies`) it was; that's the gap this closes.
 */
async function runStatsCacheDbCall<T>(
	dbCall: string,
	context: Record<string, unknown>,
	fn: () => Promise<T>
): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		console.error(
			`Stats-cache refresh DB call failed: ${dbCall}`,
			context,
			error
		);
		throw error;
	}
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

/**
 * Cuts a species-grouped merged result back to exactly the species
 * `speciesIds` names, when given. `undefined` is "no narrowing" — every row
 * is kept, matching every call site before this field existed. Only ever
 * called from the `groupBySpecies: true` branch of a refresh pass: the
 * all-species-combined write has no `species_id` to filter on, and must
 * always see the full, unfiltered result regardless of `speciesIds` — see
 * `RefreshSpeciesNarrowing`'s own doc comment for why.
 */
function filterToTouchedSpecies<Row extends MergedCellKey>(
	mergedRows: Row[],
	speciesIds: number[] | undefined
): Row[] {
	if (speciesIds === undefined) {
		return mergedRows;
	}
	const touchedSpeciesIds = new Set(speciesIds);
	return mergedRows.filter(
		(row) => row.species_id !== null && touchedSpeciesIds.has(row.species_id)
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
	cacheTable: FailedRefreshCacheTable;
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
 * Row-count cap for each cache-table `.upsert()` call below — same value as
 * `lib/demon-import.ts`'s `DEFAULT_DEMON_RECORDS_BATCH_SIZE` /
 * `DEFAULT_ENCOUNTER_ROW_CHUNK_SIZE`, kept as its own constant here rather
 * than imported since this is a separate write path. `month`/`year`/
 * `month-squashed`/`all-time` passes never produce more than a few dozen
 * rows, but `day` scales with however many distinct dates an import touched
 * (times species count for the by-species table), which is otherwise
 * unbounded.
 */
export const DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE = 100;

/** Splits `items` into fixed-size chunks, last one short if it doesn't divide evenly. */
function chunkArray<T>(items: T[], chunkSize: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += chunkSize) {
		chunks.push(items.slice(i, i + chunkSize));
	}
	return chunks;
}

/**
 * Writes one species-grouped refresh pass's merged cells to its cache's
 * `*BySpecies` table, via native `.upsert()` calls against that table's one
 * unique constraint — chunked to at most `DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE`
 * rows per call, issued sequentially (not `Promise.all`) since every chunk
 * targets the same unique index, matching `demon-import.ts`'s
 * `DemonRecordsBatchWriter` chaining precedent.
 *
 * This is where the two `time_period` conventions are reconciled: the metric
 * RPCs emit a real NULL for the all-time grain, the cache column is NOT NULL,
 * so a null becomes `ALL_TIME_SENTINEL_DATE` here rather than in the merge —
 * which has to keep the NULL to match cells across RPC results by key.
 *
 * `species_id` is asserted non-null because this is only ever called with
 * cells from a `group_by_species: true` pass, so every cell carries a real
 * species id — see `writeAllSpeciesRows` for the sibling non-species pass's
 * writer.
 */
async function writeBySpeciesRows<Cell extends MergedCellKey>(
	supabaseClient: SupabaseClient,
	cacheTable: 'SimpleStatsCacheBySpecies',
	cells: Cell[],
	{ groupId, temporalUnit }: { groupId: number; temporalUnit: TemporalUnit }
): Promise<void> {
	const rows = cells.map(({ species_id, time_period, ...metrics }) => ({
		...metrics,
		group_id: groupId,
		temporal_unit: temporalUnit,
		species_id: species_id!,
		time_period: time_period ?? ALL_TIME_SENTINEL_DATE
	}));
	for (const chunk of chunkArray(rows, DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE)) {
		await supabaseClient
			.from(cacheTable)
			.upsert(chunk, { onConflict: BY_SPECIES_CONFLICT_TARGET })
			.then(catchSupabaseErrors);
	}
}

/**
 * Writes one non-species-grouped refresh pass's merged cells to the
 * all-species-combined `SimpleStatsCache` table, the sibling of
 * `writeBySpeciesRows` for a `group_by_species: false` pass. Chunked the same
 * way — see `writeBySpeciesRows`'s docblock for why.
 *
 * This table has no `species_id` column at all (#1169 — a nullable
 * `species_id` meaning "all species" was tried and reverted), so `species_id`
 * is destructured off each cell and dropped rather than written; every cell
 * reaching here carries `species_id: null` anyway, since the RPCs collapse
 * every species into one row per `time_period` under `group_by_species:
 * false`. Same `ALL_TIME_SENTINEL_DATE` reconciliation as `writeBySpeciesRows`,
 * against the narrower `(group_id, temporal_unit, time_period)` conflict
 * target this table shape's unique constraint uses.
 */
async function writeAllSpeciesRows<Cell extends MergedCellKey>(
	supabaseClient: SupabaseClient,
	cacheTable: 'SimpleStatsCache',
	cells: Cell[],
	{ groupId, temporalUnit }: { groupId: number; temporalUnit: TemporalUnit }
): Promise<void> {
	const rows = cells.map(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude it from ...metrics; this table has no species_id column
		({ species_id, time_period, ...metrics }) => ({
			...metrics,
			group_id: groupId,
			temporal_unit: temporalUnit,
			time_period: time_period ?? ALL_TIME_SENTINEL_DATE
		})
	);
	for (const chunk of chunkArray(rows, DEFAULT_STATS_CACHE_WRITE_CHUNK_SIZE)) {
		await supabaseClient
			.from(cacheTable)
			.upsert(chunk, { onConflict: ALL_SPECIES_CONFLICT_TARGET })
			.then(catchSupabaseErrors);
	}
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
	groupBySpecies: boolean;
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
 * `recordMissingCellAnomaly`), tagged `SimpleStatsCacheBySpecies` when
 * `groupBySpecies` or plain `SimpleStatsCache` otherwise (#1182) — the same
 * table `groupBySpecies` decides this pass writes its merged rows to. Every
 * OTHER cell in the batch is unaffected — one anomalous cell never drops the
 * rest of the refresh.
 */
function mergeSimpleMetricRows({
	groupId,
	temporalUnit,
	groupBySpecies,
	basicRows,
	biometricsRows,
	birdAgeRows,
	encounterAgeRows
}: MergeMetricRowsParams): {
	mergedRows: SimpleMergedCell[];
	anomalies: FailedRefreshRow[];
} {
	const cacheTable: FailedRefreshCacheTable = groupBySpecies
		? 'SimpleStatsCacheBySpecies'
		: 'SimpleStatsCache';
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
					cacheTable,
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
 */
async function runSimpleStatsCacheRefreshPass(
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

	const rpcParamsList = buildSimpleMetricRpcParamsList(
		groupId,
		temporalUnit,
		touchedPeriods,
		groupBySpecies
	);
	if (rpcParamsList === null) {
		// Narrowing temporal unit, nothing touched this pass — nothing to refresh.
		return;
	}
	const basicRows = await runStatsCacheDbCall(
		'stats_cache_basic_session_metrics RPC',
		logContext,
		() =>
			fetchMetricRows<BasicSessionMetricsRow>(
				supabaseClient,
				'stats_cache_basic_session_metrics',
				rpcParamsList
			)
	);
	const biometricsRows = await runStatsCacheDbCall(
		'stats_cache_biometrics_metrics RPC',
		logContext,
		() =>
			fetchMetricRows<BiometricsMetricsRow>(
				supabaseClient,
				'stats_cache_biometrics_metrics',
				rpcParamsList
			)
	);
	const birdAgeRows = await runStatsCacheDbCall(
		'stats_cache_bird_age_metrics RPC',
		logContext,
		() =>
			fetchMetricRows<BirdAgeMetricsRow>(
				supabaseClient,
				'stats_cache_bird_age_metrics',
				rpcParamsList
			)
	);
	const encounterAgeRows = await runStatsCacheDbCall(
		'stats_cache_encounter_age_metrics RPC',
		logContext,
		() =>
			fetchMetricRows<EncounterAgeMetricsRow>(
				supabaseClient,
				'stats_cache_encounter_age_metrics',
				rpcParamsList
			)
	);

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

	if (groupBySpecies) {
		await runStatsCacheDbCall(
			'SimpleStatsCacheBySpecies upsert',
			logContext,
			() =>
				writeBySpeciesRows(
					supabaseClient,
					'SimpleStatsCacheBySpecies',
					filterToTouchedSpecies(rowsToWrite, speciesIds),
					{ groupId, temporalUnit }
				)
		);
	} else {
		await runStatsCacheDbCall('SimpleStatsCache upsert', logContext, () =>
			writeAllSpeciesRows(supabaseClient, 'SimpleStatsCache', rowsToWrite, {
				groupId,
				temporalUnit
			})
		);
	}

	await runStatsCacheDbCall(
		'FailedStatsCacheRefreshes insert',
		logContext,
		() => deadLetterAnomalies(supabaseClient, anomalies)
	);
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
