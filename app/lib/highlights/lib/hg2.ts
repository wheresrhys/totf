import { camelCase, noCase } from 'change-case';
import type {
	HighlightsOfType,
	YearMonthRestriction,
	HighlightDescriptor,
	HighlightValue,
	CombinedHighlight,
	HighlightCategory,
	NumericHighlightValue,
	HighlightsGenerator,
	HighlightInitConfig,
	HighlightScope,
	HighlightDataLake,
	ExtendedTemporalUnit,
	HighlightPageLevelPresence,
	HighlightPresenceAtScopes,
	HighlightValueWithRanking,
	NewHighlightValue,
	HighlightGenerationConfig
} from '../types';
import {
	getStatsByTemporalUnit,
	StatsRepository,
	fetchStatsSpines,
	getServerCachedStats,
	StatsResult
} from '@/app/actions/stats-cache';
import { isNumericHighlightValue } from '../types';
import { getRule, ruleTypes } from '../rules';
import {
	dateToYearMonth,
	getHighlightsOfTypeFromStatsRows,
	buildTimeWindowFilter,
	getFilteredStatsCache,
	getSpeciesFilter,
	filterStats,
	getTimePeriodSampler,
	descriptorToString,
	sortHighlights,
	sortByPositionAndTimeWindow,
	type PositionAndTimeWindow
} from './highlight-utils';
import { pooledRequestForStats } from './stats-cache-fetcher';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { groupByColumn } from '../../generic-utils';

type BaseHighlightsOfTypeParams = {
	highlightType: string;
	timePeriod: string;
	temporalUnit: TemporalUnit;
	viewedGroup: ViewedGroup;
	species?: string;
};

type HighlightsOfTypeParams = BaseHighlightsOfTypeParams & {
	lakeTimeWindow?: YearMonthRestriction;
	samplesTimeWindow?: YearMonthRestriction;
	limit: number;
};

async function getScopedHighlightsOfType({
	highlightType,
	viewedGroup,
	timePeriod,
	lakeTimeWindow,
	samplesTimeWindow,
	temporalUnit,
	species,
	limit
}: HighlightsOfTypeParams): Promise<NewHighlightValue[]> {
	const rule = getRule(highlightType);
	const baseData = await pooledRequestForStats({
		viewedGroup,
		rpcName: rule.rpcName,
		fetchDataBySpecies: Boolean(species) || rule.speciesUsed !== 'none',
		temporalUnit
	});

	const filteredStats = filterStats({
		rule,
		scope: {
			temporalUnit,
			parentTimeWindow: lakeTimeWindow,
			species
		},
		viewedGroup,
		baseData
	});

	const samplesTimeWindowFilter = getTimePeriodSampler(
		timePeriod,
		samplesTimeWindow
	);

	if (rule.speciesUsed === 'grouped') {
		const dataPerSpecies = groupByColumn('species_name', filteredStats);
		return Object.entries(dataPerSpecies).flatMap(([species, data]) => {
			const scope = {
				temporalUnit,
				species,
				parentTimeWindow: lakeTimeWindow
			};
			return getHighlightsOfTypeFromStatsRows({
				rule,
				stats: data,
				limit,
				timeWindowFilter: samplesTimeWindowFilter,
				scope
			}).map((value) => ({
				...value,
				scope,
				descriptor: rule.descriptor
			})) as NewHighlightValue[];
		});
	} else {
		const scope = {
			temporalUnit,
			parentTimeWindow: lakeTimeWindow
		};
		return getHighlightsOfTypeFromStatsRows({
			rule,
			stats: filteredStats,
			limit,
			timeWindowFilter: samplesTimeWindowFilter,
			scope
		}).map((value) => ({
			...value,
			scope,
			descriptor: rule.descriptor
		})) as NewHighlightValue[];
	}
}

const DEFAULT_HIGHLIGHT_INIT_CONFIG: HighlightInitConfig = {
	selfRelativeToAllTime: 1,
	childSessionsRelativeToSelf: 1
};

function getPresence(
	rule: HighlightsGenerator,
	temporalUnit: ExtendedTemporalUnit,
	outlook: 'inter' | 'intra',
	species?: string
): HighlightGenerationConfig[] | undefined | null {
	if (!rule.presence) return [];
	const rulePresence = species ? rule.presence.species : rule.presence.general;
	return rulePresence?.[
		camelCase(temporalUnit) as keyof HighlightPresenceAtScopes
	]?.[outlook];
}

function getTimeWindow(
	timePeriod: string,
	temporalUnit: ExtendedTemporalUnit
): YearMonthRestriction | undefined {
	const { year, month } = dateToYearMonth(timePeriod);

	if (temporalUnit === 'month') {
		return { month, year };
	} else if (temporalUnit === 'year') {
		return { year };
	} else if (temporalUnit === 'all time') {
		return;
	} else if (temporalUnit === 'all time month') {
		return { month };
	}
}

export async function getHighlightsOfTypeAcrossScopes({
	highlightType,
	timePeriod,
	temporalUnit,
	viewedGroup,
	species
}: {
	highlightType: string;
	timePeriod: string;
	temporalUnit: ExtendedTemporalUnit;
	viewedGroup: ViewedGroup;
	species?: string;
}) {
	const rule = getRule(highlightType);
	const presence = getPresence(rule, temporalUnit, 'inter', species);
	if (!presence) return [];

	const configs = presence
		.flatMap(({ sample: sampleTemporalUnit, lakes}) => {
			return Object.entries(lakes).map(([lakeScope, limit]) => {
				if (limit === 0) return;
				const lakeScopeTemporalUnit = noCase(
					lakeScope.replace('relativeTo', '')
				) as ExtendedTemporalUnit;
				return {
					highlightType,
					viewedGroup,
					timePeriod,
					lakeTimeWindow: getTimeWindow(timePeriod, lakeScopeTemporalUnit),
					samplesTimeWindow: getTimeWindow(timePeriod, temporalUnit),
					temporalUnit: sampleTemporalUnit,
					species,
					limit
				};
			});
		})
		.filter((config) => Boolean(config)) as HighlightsOfTypeParams[];

	return (
		await Promise.all(
			configs.map((config) => getScopedHighlightsOfType(config))
		)
	).flatMap((data) => data);
}

function removeLessSignificantHighlights(
	highlights: NewHighlightValue[]
): NewHighlightValue[] {
	return highlights.filter((highlight, i) => {
		if (!highlight.scope.parentTimeWindow) {
			return true;
		}

		return !highlights.some(
			(potentialClobber, j) =>
				// don't compare with self
				i !== j &&
				// don't clobber highlights of a completely different type
				potentialClobber.descriptor.type === highlight.descriptor.type &&
				potentialClobber.descriptor.category ===
					highlight.descriptor.category &&
				potentialClobber.scope.temporalUnit === highlight.scope.temporalUnit &&
				potentialClobber.scope.species === highlight.scope.species &&
				// clobberer must be higher ranked than subject, e.g. can't  clobber 1st place with 2nd place
				potentialClobber.ranking.position >= highlight.ranking.position &&
				// only clobber with highlights that are scoped to all time
				!potentialClobber.scope.parentTimeWindow &&
				// don't clobbe if equal position but the more locally scoped item is not tied when the global one is tied
				!(
					highlight.ranking.position === potentialClobber.ranking.position &&
					potentialClobber.ranking.isTied &&
					!highlight.ranking.isTied
				)
		);
	});
}

function combineSimilarHighlights(
	highlights: NewHighlightValue[],
	ruleType: string
): CombinedHighlight[] {
	const rule = getRule(ruleType);
	const groupedByDescriptor: Map<string, NewHighlightValue[]> = new Map();
	highlights.forEach((highlight) => {
		const mapKey = highlight.species ?? 'none';
		if (groupedByDescriptor.has(mapKey)) {
			groupedByDescriptor.get(mapKey)?.push(highlight);
		} else {
			groupedByDescriptor.set(mapKey, [highlight]);
		}
	});

	return [...groupedByDescriptor.values()].map((highlights) => {
		highlights.sort((a: NewHighlightValue, b: NewHighlightValue): number =>
			sortByPositionAndTimeWindow(
				{ position: a.ranking.position, window: a.scope.parentTimeWindow },
				{ position: b.ranking.position, window: b.scope.parentTimeWindow }
			)
		);
		return {
			formatters: rule.formatters,
			descriptor: rule.descriptor,
			value: {
				timePeriod: highlights[0].timePeriod,
				value: highlights[0].value,
				species: highlights[0].species
			},
			species: highlights[0].scope.species,
			bestPosition: Math.min(
				...highlights.map(({ ranking }) => ranking.position)
			),
			scopes: highlights.map((highlight) => ({
				scope: highlight.scope,
				ranking: highlight.ranking
			}))
		};
	});
}

export async function getAllHighlightsAcrossScopes(options: {
	timePeriod: string;
	temporalUnit: ExtendedTemporalUnit;
	viewedGroup: ViewedGroup;
	species?: string;
}) {
	const allHighlights = await Promise.all(
		ruleTypes.map(async (type) => {
			const allHighlightsOfType = await getHighlightsOfTypeAcrossScopes({
				highlightType: type,
				...options
			});
			const significantHighlights =
				removeLessSignificantHighlights(allHighlightsOfType);
			const combined = combineSimilarHighlights(significantHighlights, type);
			return combined;
		})
	);
	return sortHighlights(allHighlights.flatMap((x) => x));
}
