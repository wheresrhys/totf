import type {
	HighlightsOfType,
	CherryPickedHighlight,
	YearMonthRestriction,
	HighlightDescriptor,
	HighlightValue,
	CombinedHighlight,
	HighlightCategory,
	NumericHighlightValue,
	HighlightsGenerator,
	HighlightInitConfig,
	HighlightScope,
	TextHighlightValue
} from '../types';
import type { BiometricsStatsResult, CoreStatsResult } from '@/app/models/db';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { StatsResult } from '@/app/actions/stats-cache';
import type { ViewedGroup } from '@/app/lib/group-slug';
export type StatFilter = (stat: {
	time_period: string | null;
	species_name: string | null;
}) => boolean;

export function getTimePeriodSampler(
	timePeriod: string,
	timeWindow?: YearMonthRestriction
) {
	return timeWindow
		? buildTimeWindowFilter(timeWindow)
		: (highlightTimePeriod: string) => highlightTimePeriod === timePeriod;
}

export function filterStats({
	rule,
	viewedGroup,
	scope,
	baseData
}: {
	rule: HighlightsGenerator;
	viewedGroup: ViewedGroup;
	scope: HighlightScope;
	baseData: StatsResult[];
}): StatsResult[] {
	const cache = getFilteredStatsCache(
		viewedGroup.id,
		scope,
		rule.rpcName,
		rule.speciesUsed
	);

	if (cache.has()) {
		return cache.get() as StatsResult[];
	}

	const lakeTimeWindowFilter = buildTimeWindowFilter(scope.parentTimeWindow);
	const lakeSpeciesFilter = getSpeciesFilter(scope.species);

	const filteredStats = baseData.filter(
		({ time_period, species_name }) =>
			lakeTimeWindowFilter(time_period as string) &&
			lakeSpeciesFilter(species_name)
	);
	cache.set(filteredStats);
	return filteredStats;
}

export function limitHighlights(
	highlights: HighlightValue[],
	limit: number
): HighlightValue[] {
	if (highlights.length < limit) {
		return highlights;
	}
	const boundaryValue = highlights[limit - 1].value;
	const itemsIncludingTies =
		highlights.findLastIndex(({ value }) => value === boundaryValue) + 1;
	return highlights.slice(0, itemsIncludingTies);
}

export function dateToYearMonth(date: string): YearMonthRestriction {
	const [year, month] = date.split('-');
	return { year: Number(year), month: Number(month) };
}

export function getHighlightsOfTypeFromStatsRows({
	rule,
	stats,
	timeWindowFilter,
	limit
}: {
	rule: HighlightsGenerator;
	stats: (CoreStatsResult | BiometricsStatsResult)[];
	limit: number;
	timeWindowFilter: (timePeriod: string) => boolean;
}): HighlightValue[] {
	const highlights = rule.generator(
		stats as CoreStatsResult[] & BiometricsStatsResult[]
	);

	return limitHighlights(highlights, limit).filter(({ timePeriod }) =>
		timeWindowFilter(timePeriod)
	);
}

export function buildTimeWindowFilter(parentTimeWindow?: YearMonthRestriction) {
	if (!parentTimeWindow) {
		return () => true;
	}
	const { year, month } = parentTimeWindow;
	if (year && month) {
		return (timePeriod: string) =>
			timePeriod.startsWith(`${year}-${String(month).padStart(2, '0')}-`);
	} else if (year) {
		return (timePeriod: string) => timePeriod.startsWith(`${year}-`);
	} else if (month) {
		return (timePeriod: string) =>
			timePeriod.includes(`-${String(month).padStart(2, '0')}-`);
	} else {
		return () => true;
	}
}

export function getCacheKey(
	groupId: number,
	scope: HighlightScope,
	limit?: number
): string {
	let cacheKey = `${groupId}-${scope.temporalUnit}-${limit || 'no-limit'}-${scope.species || 'no-species'}`;
	if (!scope.parentTimeWindow) {
		return cacheKey;
	}
	const { month, year } = scope.parentTimeWindow;
	if (year && month) {
		cacheKey = `${cacheKey}-${year}-${month}`;
	} else if (year) {
		cacheKey = `${cacheKey}-${year}`;
	} else if (month) {
		cacheKey = `${cacheKey}-${month}`;
	}

	return cacheKey;
}

const filteredStatsCache: Map<
	string,
	(CoreStatsResult | BiometricsStatsResult)[]
> = new Map();

export type FilteredStatsCache = {
	has: () => boolean;
	set: (filteredStats: (CoreStatsResult | BiometricsStatsResult)[]) => void;
	get: () => (CoreStatsResult | BiometricsStatsResult)[] | undefined;
};

export function getFilteredStatsCache(
	groupId: number,
	scope: HighlightScope,
	rpcName: string,
	speciesUsed: 'none' | 'present' | 'grouped'
): FilteredStatsCache {
	const cacheKey = getCacheKey(groupId, scope);

	return {
		has: () => filteredStatsCache.has(`${cacheKey}-${rpcName}-${speciesUsed}`),
		set: (filteredStats: (CoreStatsResult | BiometricsStatsResult)[]) =>
			filteredStatsCache.set(
				`${cacheKey}-${rpcName}-${speciesUsed}`,
				filteredStats
			),
		get: () => filteredStatsCache.get(`${cacheKey}-${rpcName}-${speciesUsed}`)
	};
}

export function getSpeciesFilter(species?: string) {
	return species
		? (species_name: string | null) => species_name === species
		: () => true;
}

export function getScopedStatsFilter(scope: HighlightScope): StatFilter | null {
	if (!scope.parentTimeWindow) {
		return null;
	}
	const timeWindowFilter = buildTimeWindowFilter(scope.parentTimeWindow);
	const { month, year } = scope.parentTimeWindow;
	const speciesFilter = getSpeciesFilter(scope.species);
	let filter: StatFilter | null;
	if (year && month) {
		filter = ({ time_period, species_name }) =>
			timeWindowFilter(time_period as string) && speciesFilter(species_name);
	} else if (year) {
		filter = ({ time_period, species_name }) =>
			timeWindowFilter(time_period as string) && speciesFilter(species_name);
	} else if (month) {
		filter = ({ time_period, species_name }) =>
			timeWindowFilter(time_period as string) && speciesFilter(species_name);
	} else if (scope.species) {
		filter = ({ species_name }) => speciesFilter(species_name);
	} else {
		filter = null;
	}

	return filter;
}
