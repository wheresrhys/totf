import {
	getStatsByTemporalUnit,
	StatsRepository
} from '@/app/actions/stats-cache';
import { groupByColumn } from '@/app/lib/generic-utils';
import { highlightRules } from '../rules';
import type { HighlightsOfType, YearMonthRestriction } from '../types';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import { CoreStatsResult } from '@/app/models/db';
import { DEFAULT_LIMIT } from '../const';

const cache: Map<string, HighlightsOfType[]> = new Map();

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

function isHighlightsOfType(item: unknown): item is HighlightsOfType {
	return Boolean(item);
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

function getCacheUtils(
	groupId: number,
	temporalUnit: TemporalUnit,
	limit?: number,
	parentTimeWindow?: YearMonthRestriction
): {
	cacheKey: string;
	filter: ((timePeriod: string) => boolean) | null;
} {
	let cacheKey = `${groupId}-${temporalUnit}-${limit || 'no-limit'}`;
	if (!parentTimeWindow) {
		return { cacheKey, filter: null };
	}
	const { month, year } = parentTimeWindow;
	let filter: ((timePeriod: string) => boolean) | null;
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
		filter = null;
	}

	return { filter, cacheKey };
}

async function getFilteredStats(
	temporalUnit: TemporalUnit,
	groupId: number,
	filter: ((timePeriod: string) => boolean) | null
) {
	const stats = await getStatsByTemporalUnit(temporalUnit, groupId);

	if (!filter) {
		return stats;
	}
	const withSpecies = stats.withSpecies.filter(({ time_period }) =>
		filter(time_period)
	);
	const bySpecies = groupByColumn('species_name', withSpecies);
	return {
		overall: stats.overall.filter(({ time_period }) => filter(time_period)),
		withSpecies,
		bySpecies
	};
}

export async function getHighlightsWithinTimeWindow({
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
	limit = limit ?? DEFAULT_LIMIT;

	const { filter, cacheKey } = getCacheUtils(
		groupId,
		temporalUnit,
		limit,
		parentTimeWindow
	);
	if (cache.has(cacheKey)) {
		return cache.get(cacheKey) as HighlightsOfType[];
	}

	const highlights = generateAllHighlights({
		stats: await getFilteredStats(temporalUnit, groupId, filter),
		temporalUnit,
		parentTimeWindow,
		limit,
		includePerSpecies
	});

	cache.set(cacheKey, highlights);
	return highlights;
}
