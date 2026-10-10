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
import {
	getHighlightsOfTypeFromStatsRows,
	getCacheKey,
	getScopedStatsFilter,
	type FilteredStatsCache,
	type StatFilter
} from './highlight-utils';

const highlightsCache: Map<string, HighlightsOfType[]> = new Map();

function isHighlightsOfType(item: unknown): item is HighlightsOfType {
	return Boolean(item);
}

function generateAllHighlights({
	stats,
	scope,
	limit,
	includePerSpecies,
	excludeGlobal
}: {
	stats: EnhancedStatsRepository;
	scope: HighlightScope;
	limit: number;
	includePerSpecies: boolean;
	excludeGlobal?: boolean;
}) {
	return highlightRules
		.flatMap((rule) => {
			if (rule.condition && !rule.condition(scope)) return null;
			const workingStats = stats[rule.statsSelector];
			if (!excludeGlobal && Array.isArray(workingStats)) {
				return {
					...rule,
					scope,
					values: getHighlightsOfTypeFromStatsRows({
						rule,
						stats: workingStats,
						limit: rule.limit ? Math.min(rule.limit, limit) : limit,
						timeWindowFilter: () => true
					})
				};
			} else {
				if (!includePerSpecies) return null;
				return Object.entries(workingStats).map(
					([species, workingStatsChild]) => {
						if (!workingStatsChild.length) return null;
						return {
							...rule,
							scope: {
								...scope,
								species
							},
							values: getHighlightsOfTypeFromStatsRows({
								rule,
								stats: workingStatsChild,
								limit: rule.limit ? Math.min(rule.limit, limit) : limit,
								timeWindowFilter: () => true
							})
						} as HighlightsOfType;
					}
				);
			}
		})
		.filter(isHighlightsOfType);
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
	filter: StatFilter | null
): Promise<EnhancedStatsRepository> {
	// This module's own public API is plain-`groupId`-based throughout (it
	// predates, and is out of scope for, the `ViewedGroup` migration) — `.slug`
	// is never read by `getStatsByTemporalUnit`, so a synthetic `ViewedGroup`
	// is a safe stand-in rather than widening every caller up the chain just to
	// carry a slug this fetch never uses.
	const stats = await getStatsByTemporalUnit(temporalUnit, {
		id: groupId,
		slug: null
	});

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
	includePerSpecies,
	excludeGlobal
}: {
	temporalUnit: TemporalUnit;
	groupId: number;
	limit?: number;
	species?: string;
	parentTimeWindow?: YearMonthRestriction;
	includePerSpecies: boolean;
	excludeGlobal?: boolean;
}) {
	limit = limit ?? DEFAULT_LIMIT;
	const scope = {
		temporalUnit,
		species,
		parentTimeWindow
	};
	const cacheKey = getCacheKey(groupId, scope, limit);
	const filter = getScopedStatsFilter(scope);

	if (highlightsCache.has(cacheKey)) {
		return highlightsCache.get(cacheKey) as HighlightsOfType[];
	}

	const highlights = generateAllHighlights({
		stats: await getFilteredStats(temporalUnit, groupId, filter),
		scope: { temporalUnit, parentTimeWindow },
		limit,
		includePerSpecies,
		excludeGlobal
	});

	highlightsCache.set(cacheKey, highlights);
	return highlights;
}
