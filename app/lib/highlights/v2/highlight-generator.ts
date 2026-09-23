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

function generateAllHighlights({
	stats,
	temporalUnit,
	parentTimeWindow,
	limit,
	includePerSpecies
}: {
	stats: StatsRepository<CoreStatsResult>;
	temporalUnit: TemporalUnit;
	parentTimeWindow?: YearMonthRestriction;
	limit: number;
	includePerSpecies: boolean;
}) {
	return highlightRules
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
				if (!includePerSpecies) return null;
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
}

export async function getScopedHighlights({
	temporalUnit,
	groupId,
	limit,
	parentTimeWindow,
	includePerSpecies
}: {
	temporalUnit: TemporalUnit;
	groupId: number;
	limit?: number;
	parentTimeWindow?: YearMonthRestriction;
	includePerSpecies: boolean;
}) {
	let stats = await getStatsByTemporalUnit(temporalUnit, groupId);
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

		const withSpecies = stats.withSpecies.filter(({ time_period }) =>
			filter(time_period)
		);
		const bySpecies = groupByColumn('species_name', withSpecies);
		stats = {
			overall: stats.overall.filter(({ time_period }) => filter(time_period)),
			withSpecies,
			bySpecies
		};
	}
	if (!limit) {
		limit = Math.min(
			DEFAULT_OPTIONS.limit,
			Math.ceil(stats.overall.length / 4)
		);
	}
	let unboundedHighlights: HighlightsOfType[];
	limit = limit || DEFAULT_OPTIONS.limit;
	if (cache.has(cacheKey)) {
		unboundedHighlights = cache.get(cacheKey) as HighlightsOfType[];
	} else {
		unboundedHighlights = generateAllHighlights({
			stats,
			temporalUnit,
			parentTimeWindow,
			limit,
			includePerSpecies
		});

		cache.set(cacheKey, unboundedHighlights);
	}
	return unboundedHighlights;
}
