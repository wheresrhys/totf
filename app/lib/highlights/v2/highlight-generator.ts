import {
	getStatsByTemporalUnit,
	StatsRepository
} from '@/app/actions/highlights-data';
import { DEFAULT_OPTIONS } from './utils/highlight-rules';
import { highlightRules } from './rules';
import type { HighlightsOfType, YearMonthRestriction } from './types';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import { CoreStatsResult } from '@/app/models/db';

function applyLimitToHighlight(
	highlightWrapper: HighlightsOfType,
	limit: number
): HighlightsOfType {
	if (highlightWrapper.values.length < limit) {
		return {
			...highlightWrapper
		};
	}
	const boundaryValue = highlightWrapper.values[limit - 1].value;
	const itemsIncludingTies =
		highlightWrapper.values.findLastIndex(
			({ value }) => value === boundaryValue
		) + 1;
	return {
		...highlightWrapper,
		values: highlightWrapper.values.slice(0, itemsIncludingTies)
	};
}

//TODO do something to clear cache when logging out

const cache: Map<string, HighlightsOfType[]> = new Map();

function isHighlightsOfType(item: unknown): item is HighlightsOfType {
	return Boolean(item);
}

function generateHighlightsFromStats({
	stats,
	limit,
	temporalUnit,
	parentTimeWindow,
	cacheKey
}: {
	stats: StatsRepository<CoreStatsResult>;
	temporalUnit: TemporalUnit;
	limit?: number;
	parentTimeWindow?: YearMonthRestriction;
	cacheKey: string;
}): HighlightsOfType[] {
	let unboundedHighlights: HighlightsOfType[];
	limit = limit || DEFAULT_OPTIONS.limit;
	if (cache.has(cacheKey)) {
		unboundedHighlights = cache.get(cacheKey) as HighlightsOfType[];
	} else {
		unboundedHighlights = highlightRules
			.flatMap((rule) => {
				if (rule.condition && !rule.condition(temporalUnit, parentTimeWindow))
					return null;
				const workingStats = rule.statsSelector(stats);
				if (Array.isArray(workingStats)) {
					const highlights: HighlightsOfType = {
						...rule,
						scope: { temporalUnit, parentTimeWindow: parentTimeWindow },
						values: rule.generator(workingStats)
					};
					return applyLimitToHighlight(
						highlights,
						rule.limit ? Math.min(rule.limit, limit) : limit
					);
				} else {
					return Object.entries(workingStats).map(
						([species, workingStatsChild]) => {
							if (!workingStatsChild.length) return null;
							const highlights: HighlightsOfType = {
								...rule,
								scope: {
									temporalUnit,
									parentTimeWindow: parentTimeWindow,
									species
								},
								values: rule.generator(workingStatsChild)
							};
							return highlights.values.length
								? applyLimitToHighlight(
										highlights,
										rule.limit ? Math.min(rule.limit, limit) : limit
									)
								: null;
						}
					);
				}
			})
			.filter(isHighlightsOfType);

		cache.set(cacheKey, unboundedHighlights);
	}
	return unboundedHighlights;
}

function groupByColumn<T>(column: keyof T, rows: T[]): Record<string, T[]> {
	const aggregator: Record<string, T[]> = {};
	rows.forEach((row: T) => {
		const groupKey = row[column] as string;
		if (!(groupKey in aggregator)) {
			aggregator[groupKey] = [];
		}
		aggregator[groupKey].push(row);
	});
	return aggregator;
}

export async function getScopedHighlights({
	temporalUnit,
	groupId,
	limit,
	parentTimeWindow
}: {
	temporalUnit: TemporalUnit;
	groupId: number;
	limit?: number;
	parentTimeWindow?: YearMonthRestriction;
}) {
	let dailyStats = await getStatsByTemporalUnit(temporalUnit, groupId);
	let cacheKey = `${groupId}-${temporalUnit}`;
	if (parentTimeWindow) {
		const { month, year } = parentTimeWindow;
		let filter: (timePeriod: string) => boolean;
		if (year && month) {
			cacheKey = `${cacheKey}-${year}-${month}`;
			filter = (timePeriod) =>
				timePeriod.startsWith(`${year}-${String(month).padStart(2, '0')}-`);
		} else if (year) {
			cacheKey = `${cacheKey}-${year}`;
			filter = (timePeriod) => timePeriod.startsWith(`${year}-`);
		} else if (month) {
			cacheKey = `${cacheKey}-${month}`;
			filter = (timePeriod) =>
				timePeriod.includes(`-${String(month).padStart(2, '0')}-`);
		} else {
			filter = () => true;
		}

		const withSpecies = dailyStats.withSpecies.filter(({ time_period }) =>
			filter(time_period)
		);
		const bySpecies = groupByColumn('species_name', withSpecies);
		dailyStats = {
			overall: dailyStats.overall.filter(({ time_period }) =>
				filter(time_period)
			),
			withSpecies,
			bySpecies
		};
	}
	if (!limit) {
		limit = Math.min(
			DEFAULT_OPTIONS.limit,
			Math.ceil(dailyStats.overall.length / 4)
		);
	}
	return generateHighlightsFromStats({
		cacheKey,
		temporalUnit,
		parentTimeWindow,
		stats: dailyStats,
		limit
	});
}
