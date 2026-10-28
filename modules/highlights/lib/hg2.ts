import { camelCase, noCase } from 'change-case';
import type {
	YearMonthRestriction,
	CombinedHighlight,
	HighlightsGenerator,
	HighlightOutlook,
	ExtendedTemporalUnit,
	HighlightPresenceAtScopes,
	NewHighlightValue,
	HighlightGenerationConfig
} from '../types';
import { getRule, ruleTypes } from '../rules';
import {
	dateToYearMonth,
	getHighlightsOfTypeFromStatsRows,
	filterStats,
	getTimePeriodSampler,
	sortHighlights,
	sortByPositionAndTimeWindow
} from './highlight-utils';
import { pooledStatsCacheFetch, type  StatsResult } from '@/modules/stats';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { groupByColumn } from '@/app/lib/generic-utils';

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
	// `pooledStatsCacheFetch`/`readStatsCacheRows` return plain
	// `Record<string, unknown>[]` rows (#1236) — narrowed here to the shape
	// every Highlights rule already expects, same as every other
	// `readStatsCacheRows`-family caller narrows its own result.
	const baseData = (await pooledStatsCacheFetch({
		viewedGroup,
		bySpecies: Boolean(species) || rule.speciesUsed !== 'none',
		temporalUnit
	})) as StatsResult[];

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

function getPresence(
	rule: HighlightsGenerator,
	temporalUnit: ExtendedTemporalUnit,
	outlook: HighlightOutlook,
	species?: string
): HighlightGenerationConfig[] | undefined | null {
	if (!rule.presence) return [];
	const rulePresence = species ? rule.presence.species : rule.presence.general;
	return rulePresence?.[
		camelCase(temporalUnit) as keyof HighlightPresenceAtScopes
	]?.[outlook];
}

function getTimeWindow(
	timePeriod: string | null,
	temporalUnit: ExtendedTemporalUnit
): YearMonthRestriction | undefined {
	if (!timePeriod) {
		return;
	}
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

export async function getRawHighlightsOfTypeAcrossScopes({
	highlightType,
	timePeriod,
	temporalUnit,
	viewedGroup,
	outlook,
	species
}: {
	highlightType: string;
	timePeriod: string | null;
	temporalUnit: ExtendedTemporalUnit;
	viewedGroup: ViewedGroup;
	outlook: HighlightOutlook;
	species?: string;
}) {
	const rule = getRule(highlightType);
	const presence = getPresence(rule, temporalUnit, outlook, species);
	if (!presence) return [];

	const configs = presence
		.flatMap(({ sample: sampleTemporalUnit, lakes }) => {
			return Object.entries(lakes).map(([lakeScope, limit]) => {
				if (limit === 0) return;
				const lakeScopeTemporalUnit = noCase(lakeScope) as ExtendedTemporalUnit;
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
	const groupings: Map<string, NewHighlightValue[]> = new Map();
	highlights.forEach((highlight) => {
		const mapKey = `${highlight.scope.temporalUnit}-${highlight.timePeriod}-${highlight.species ?? 'no-species'}`;
		if (groupings.has(mapKey)) {
			groupings.get(mapKey)?.push(highlight);
		} else {
			groupings.set(mapKey, [highlight]);
		}
	});

	return [...groupings.values()].map((highlights) => {
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

export async function getCombinedHighlightsOfTypeAcrossScopes(options: {
	timePeriod: string | null;
	temporalUnit: ExtendedTemporalUnit;
	viewedGroup: ViewedGroup;
	outlook: HighlightOutlook;
	species?: string;
	highlightType: string;
}) {
	const allHighlightsOfType = await getRawHighlightsOfTypeAcrossScopes(options);
	const significantHighlights =
		removeLessSignificantHighlights(allHighlightsOfType);
	const combined = combineSimilarHighlights(
		significantHighlights,
		options.highlightType
	);

	return combined;
}

export async function getAllHighlightsOfOutlookAcrossScopes(options: {
	timePeriod: string | null;
	temporalUnit: ExtendedTemporalUnit;
	viewedGroup: ViewedGroup;
	outlook: HighlightOutlook;
	species?: string;
}) {
	const allHighlights = await Promise.all(
		ruleTypes.map(async (type) =>
			getCombinedHighlightsOfTypeAcrossScopes({
				highlightType: type,
				...options
			})
		)
	);
	return sortHighlights(allHighlights.flatMap((x) => x));
}

export async function getAllHighlightsAcrossScopes(options: {
	timePeriod: string | null;
	temporalUnit: ExtendedTemporalUnit;
	viewedGroup: ViewedGroup;
	species?: string;
}) {
	const [inter, intra] = await Promise.all([
		getAllHighlightsOfOutlookAcrossScopes({
			...options,
			outlook: 'inter'
		}),
		getAllHighlightsOfOutlookAcrossScopes({
			...options,
			outlook: 'intra'
		})
	]);
	return {
		inter,
		intra
	};
}
