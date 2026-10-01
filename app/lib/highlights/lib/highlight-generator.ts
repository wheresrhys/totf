import {
	getStatsByTemporalUnit,
	StatsRepository
} from '@/app/actions/stats-cache';
import { groupByColumn } from '@/app/lib/generic-utils';
import { highlightRules } from '../rules';
import type {
	HighlightsOfType,
	YearMonthRestriction,
	EnhancedStatsRepository,
	HighlightValue,
	HighlightScope
} from '../types';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
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
	scope,
	limit,
	includePerSpecies
}: {
	stats: EnhancedStatsRepository;
	scope: HighlightScope;
	limit: number;
	includePerSpecies: boolean;
}) {
	return highlightRules
		.flatMap((rule) => {
			if (rule.condition && !rule.condition(scope)) return null;
			const workingStats = stats[rule.statsSelector];
			if (Array.isArray(workingStats)) {
				const highlights: HighlightsOfType = {
					...rule,
					scope,
					// rule.statsSelector always names the array whose row type matches rule.generator's
					// param type (enforced by HighlightsGenerator's discriminated union in types.ts) —
					// TS can't see that correlation across this generic dispatch loop, so assert it here,
					// the one place that needs it.
					values: (rule.generator as (stats: unknown[]) => HighlightValue[])(
						workingStats
					)
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
								...scope,
								species
							},
							values: (
								rule.generator as (stats: unknown[]) => HighlightValue[]
							)(workingStatsChild)
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
	species?: string,
	parentTimeWindow?: YearMonthRestriction
): {
	cacheKey: string;
	filter:
		| ((stat: { time_period: string; species_name: string | null }) => boolean)
		| null;
} {
	let cacheKey = `${groupId}-${temporalUnit}-${limit || 'no-limit'}-${species || 'no-species'}`;
	if (!parentTimeWindow) {
		return { cacheKey, filter: null };
	}
	const { month, year } = parentTimeWindow;
	const speciesFilter = species
		? (species_name: string | null) => species_name === species
		: () => true;
	let filter: ((stat: {
		time_period: string;
		species_name: string | null;
	}) => boolean) | null;
	if (year && month) {
		cacheKey = `${cacheKey}-${year}-${month}`;
		filter = ({ time_period, species_name }) =>
			(time_period as string).startsWith(`${year}-${String(month).padStart(2, '0')}-`) &&
			speciesFilter(species_name);
	} else if (year) {
		cacheKey = `${cacheKey}-${year}`;
		filter = ({ time_period, species_name }) =>
			(time_period as string).startsWith(`${year}-`) && speciesFilter(species_name);
	} else if (month) {
		cacheKey = `${cacheKey}-${month}`;
		filter = ({ time_period, species_name }) =>
			(time_period as string).includes(`-${String(month).padStart(2, '0')}-`) &&
			speciesFilter(species_name);
	} else if (species) {
		filter = ({ species_name }) => speciesFilter(species_name);
	} else {
		filter = null;
	}

	return { filter, cacheKey };
}

function enhanceStatsRepository(
	stats: StatsRepository
): EnhancedStatsRepository {
	return {
		...stats,
		coreStatsBySpecies: groupByColumn(
			'species_name',
			stats.coreStatsWithSpecies
		),
		biometricsStatsBySpecies: groupByColumn(
			'species_name',
			stats.biometricsStatsWithSpecies
		)
	};
}

async function getFilteredStats(
	temporalUnit: TemporalUnit,
	groupId: number,
	filter: ((stat: {
		time_period: string;
		species_name: string | null;
	}) => boolean) | null
): Promise<EnhancedStatsRepository> {
	const stats = await getStatsByTemporalUnit(temporalUnit, groupId);

	if (!filter) {
		return enhanceStatsRepository(stats);
	}

	return enhanceStatsRepository({
		coreStats: stats.coreStats.filter(filter),
		coreStatsWithSpecies: stats.coreStatsWithSpecies.filter(filter),
		biometricsStatsWithSpecies: stats.biometricsStatsWithSpecies.filter(filter)
	});
}

export async function getHighlightsWithinTimeWindow({
	temporalUnit,
	groupId,
	limit,
	species,
	parentTimeWindow,
	includePerSpecies
}: {
	temporalUnit: TemporalUnit;
	groupId: number;
	limit?: number;
	species?: string;
	parentTimeWindow?: YearMonthRestriction;
	includePerSpecies: boolean;
}) {
	limit = limit ?? DEFAULT_LIMIT;

	const { filter, cacheKey } = getCacheUtils(
		groupId,
		temporalUnit,
		limit,
		species,
		parentTimeWindow
	);
	if (cache.has(cacheKey)) {
		return cache.get(cacheKey) as HighlightsOfType[];
	}

	const highlights = generateAllHighlights({
		stats: await getFilteredStats(temporalUnit, groupId, filter),
		scope: { temporalUnit, parentTimeWindow },
		limit,
		includePerSpecies
	});

	cache.set(cacheKey, highlights);
	return highlights;
}
