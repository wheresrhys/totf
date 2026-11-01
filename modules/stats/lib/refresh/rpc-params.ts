import type { ExactFilterTemporalUnit } from '@/app/models/temporal-unit';
import type { StatsTemporalUnit, MetricRpcParams } from '../../types';

/** Temporal units `refreshSimpleStatsCache` may narrow by affected dates — every unit but `all-time`. See this module's CLAUDE.md for why `month-squashed` narrows too. */
export const SIMPLE_NARROWING_TEMPORAL_UNITS: ReadonlySet<StatsTemporalUnit> =
	new Set(['day', 'month', 'year', 'month-squashed']);

/** Whether this temporal unit narrows by exact-match `year_filter`/`month_filter` rather than a `from_date`/`to_date` window — see this module's CLAUDE.md. */
function isExactFilterTemporalUnit(
	temporalUnit: StatsTemporalUnit
): temporalUnit is ExactFilterTemporalUnit {
	return (
		temporalUnit === 'month' ||
		temporalUnit === 'year' ||
		temporalUnit === 'month-squashed'
	);
}

/** The exact-match RPC filters selecting precisely the period a `month`/`year`/`month-squashed` period string names. `month-squashed` deliberately never reads the year component — see this module's CLAUDE.md. */
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

/** The parts of a metric RPC's filter object shared by every call of one refresh pass. */
function unwindowedMetricRpcParams(
	groupId: number,
	temporalUnit: StatsTemporalUnit,
	groupBySpecies: boolean
): MetricRpcParams {
	return {
		ringing_group_filter: groupId,
		group_by_species: groupBySpecies,
		// Omit the key entirely for all-time, same convention as elsewhere in the app.
		...(temporalUnit === 'all-time'
			? {}
			: { group_by_time_period: temporalUnit })
	};
}

/** Batch-size cap for the `day` unit's `from_date`/`to_date` window(s), in real session dates spanned — see `batchPeriodsBySessionDateSpan` and this module's CLAUDE.md. */
const DEFAULT_DAY_BATCH_SIZE_BY_SPECIES = 50;
const DAY_BATCH_SIZE_NOT_BY_SPECIES = 200;

function dayBatchSize(groupBySpecies: boolean): number {
	if (!groupBySpecies) {
		return DAY_BATCH_SIZE_NOT_BY_SPECIES;
	}
	const envValue = Number(process.env.STATS_CACHE_REFRESH_DAY_BATCH_SIZE);
	// `> 0` rejects unset/blank/non-numeric/zero/negative in one check.
	return envValue > 0 ? envValue : DEFAULT_DAY_BATCH_SIZE_BY_SPECIES;
}

/** Splits `periods` into batches bounded by real session-date span in `groupSessionDates`, not by period count — see this module's CLAUDE.md for why that distinction matters. */
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

/** Builds the `day`-unit (window-narrowing) filter object(s) for one temporal-unit invocation, one per `batchPeriodsBySessionDateSpan` batch. `null` means nothing to refresh. */
function buildMetricRpcParams(
	groupId: number,
	temporalUnit: StatsTemporalUnit,
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
		// Non-narrowing unit: full-replace, ignoring `periods` entirely.
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

	// A `day` period string already is a date, so it's its own window bound.
	return batches.map((batch) => ({
		...unwindowedParams,
		from_date: batch[0],
		to_date: batch[batch.length - 1]
	}));
}

/** Every metric-RPC filter object one refresh pass needs, in call order — see this module's CLAUDE.md for how each temporal unit fans out. `null` means nothing to refresh. */
export function buildSimpleMetricRpcParamsList(
	groupId: number,
	temporalUnit: StatsTemporalUnit,
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

	// Several affected dates can collapse onto the same period string — de-duplicate.
	const distinctPeriods = [...new Set(periods)];
	if (distinctPeriods.length === 0) {
		return null;
	}

	return distinctPeriods.map((periodString) => ({
		...unwindowedMetricRpcParams(groupId, temporalUnit, groupBySpecies),
		...exactPeriodFilters(temporalUnit, periodString)
	}));
}
