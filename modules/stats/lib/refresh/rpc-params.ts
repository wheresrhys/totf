import type { TemporalUnit, MetricRpcParams } from '../../types';

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
export const SIMPLE_NARROWING_TEMPORAL_UNITS: ReadonlySet<TemporalUnit> =
	new Set(['day', 'month', 'year', 'month-squashed']);

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
 * `modules/stats/lib/stats-cache-events.ts`'s `periodsTouched`. Each unit uses the
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
		// `modules/stats/lib/stats-cache-events.ts`'s all-time event use.
		...(temporalUnit === 'all-time'
			? {}
			: { group_by_time_period: temporalUnit })
	};
}

/**
 * Batch-size cap for the `day` unit's `from_date`/`to_date` window(s) — see
 * `batchPeriodsBySessionDateSpan`. Counts REAL session dates a window may
 * span, not touched periods: a batch of 2 widely-separated touched periods
 * (e.g. a group's very first and very last session ever) would still produce
 * an all-history-spanning window if capped by period count alone, which is
 * exactly the failure mode this batching exists to avoid. Only the
 * `groupBySpecies: true` pass is tunable via env var, per the narrower
 * writer's own request — the `false` pass is hardcoded.
 */
const DEFAULT_DAY_BATCH_SIZE_BY_SPECIES = 50;
const DAY_BATCH_SIZE_NOT_BY_SPECIES = 200;

function dayBatchSize(groupBySpecies: boolean): number {
	if (!groupBySpecies) {
		return DAY_BATCH_SIZE_NOT_BY_SPECIES;
	}
	const envValue = Number(process.env.STATS_CACHE_REFRESH_DAY_BATCH_SIZE);
	// `envValue > 0` rejects unset/blank/non-numeric/zero/negative all at
	// once — important since a zero-or-negative batch size would make the
	// loop below never advance `batchStartIndex` past the first period.
	return envValue > 0 ? envValue : DEFAULT_DAY_BATCH_SIZE_BY_SPECIES;
}

/**
 * Splits `periods` into batches such that each batch's first and last period
 * are at most `batchSize` REAL session dates apart in `groupSessionDates`
 * (the group's full, sorted list of distinct `Sessions.visit_date` values) —
 * not at most `batchSize` *periods* apart. This is what makes two
 * widely-spaced touched periods (e.g. a group's very first and very last
 * session ever) split into two separate single-period batches rather than
 * one batch whose `from_date`/`to_date` spans the group's entire history: by
 * period count alone they're "only 2 items", but their index-distance in the
 * real session-date list is everything, which is exactly what this function
 * checks instead.
 *
 * Sorts `periods` itself (lexicographic `yyyy-MM-dd` sort is chronological —
 * same convention `buildMetricRpcParams` already relied on). A period with no
 * matching entry in `groupSessionDates` gets its own standalone batch rather
 * than crashing or being silently dropped — defensive only: every real `day`
 * period is an import's affected date, which by construction has a matching
 * `Sessions` row for the group (see `modules/stats/lib/stats-cache-events.ts`), but
 * nothing enforces that invariant from this function's own side.
 */
export function batchPeriodsBySessionDateSpan(
	periods: string[],
	groupSessionDates: string[],
	batchSize: number
): string[][] {
	const sortedPeriods = [...periods].sort();
	const indexByDate = new Map(
		groupSessionDates.map((date, index) => [date, index])
	);

	const batches: string[][] = [];
	let currentBatch: string[] = [];
	let batchStartIndex = -1;

	for (const period of sortedPeriods) {
		const index = indexByDate.get(period);
		if (index === undefined) {
			if (currentBatch.length > 0) {
				batches.push(currentBatch);
			}
			batches.push([period]);
			currentBatch = [];
			batchStartIndex = -1;
			continue;
		}
		if (currentBatch.length === 0) {
			currentBatch = [period];
			batchStartIndex = index;
		} else if (index - batchStartIndex < batchSize) {
			currentBatch.push(period);
		} else {
			batches.push(currentBatch);
			currentBatch = [period];
			batchStartIndex = index;
		}
	}
	if (currentBatch.length > 0) {
		batches.push(currentBatch);
	}
	return batches;
}

/**
 * Builds the shared filter object(s) passed to every metric RPC of one
 * cache's single temporal-unit invocation.
 *
 * Returns `null` for a narrowing temporal unit with no touched periods — there
 * is no sensible `from_date`/`to_date` window to compute in that case, and
 * nothing would be narrowed by it anyway, so the caller treats that as
 * "nothing to refresh" rather than falling back to an unbounded, effectively
 * all-time call under narrow semantics.
 *
 * Only ever reached with a *window*-narrowing temporal unit — `day`.
 * `buildSimpleMetricRpcParamsList` peels `month`/`year`/`month-squashed` off
 * into its own exact-filter fan-out before calling this (#1176).
 *
 * Returns a LIST, one object per batch `batchPeriodsBySessionDateSpan`
 * produces, rather than a single object spanning the whole `periods` range —
 * see that function's own doc comment for why a single min/max window is
 * unsafe for a sparse `periods` list. `groupSessionDates` is only consulted
 * for a narrowing temporal unit with periods to batch; the non-narrowing
 * (`all-time`) branch ignores it entirely.
 */
function buildMetricRpcParams(
	groupId: number,
	temporalUnit: TemporalUnit,
	periods: string[],
	groupSessionDates: string[],
	groupBySpecies: boolean
): MetricRpcParams[] | null {
	const unwindowedParams = unwindowedMetricRpcParams(
		groupId,
		temporalUnit,
		groupBySpecies
	);

	if (!SIMPLE_NARROWING_TEMPORAL_UNITS.has(temporalUnit)) {
		// Always full-replace, over the group's whole history (no from_date/
		// to_date), with the `periods` argument ignored entirely.
		return [unwindowedParams];
	}

	if (periods.length === 0) {
		return null;
	}

	const batches = batchPeriodsBySessionDateSpan(
		periods,
		groupSessionDates,
		dayBatchSize(groupBySpecies)
	);

	// Each batch's bounds are a period string verbatim: for the one unit that
	// still narrows by window — `day` — a period string already *is* a date,
	// so a single-period batch is both its own first and its own last day.
	return batches.map((batch) => ({
		...unwindowedParams,
		from_date: batch[0],
		to_date: batch[batch.length - 1]
	}));
}

/**
 * Every metric-RPC filter object one `refreshSimpleStatsCache` pass needs, in
 * call order — a list because `month`/`year`/`month-squashed` fan out to one
 * exact-filtered call per distinct touched period (#1176/#1178), and `day`
 * fans out to one call per real-session-date-span batch
 * (`batchPeriodsBySessionDateSpan`). Only `all-time` stays on the single
 * unwindowed object `buildMetricRpcParams` always produces for it.
 *
 * Returns `null` on the same "nothing to refresh" condition that function does:
 * a narrowing temporal unit with no touched periods.
 */
export function buildSimpleMetricRpcParamsList(
	groupId: number,
	temporalUnit: TemporalUnit,
	periods: string[],
	groupSessionDates: string[],
	groupBySpecies: boolean
): MetricRpcParams[] | null {
	if (!isExactFilterTemporalUnit(temporalUnit)) {
		return buildMetricRpcParams(
			groupId,
			temporalUnit,
			periods,
			groupSessionDates,
			groupBySpecies
		);
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
