import { noCase } from 'change-case';
import type {
	CombinedHighlight,
	HighlightOutlook,
	NewHighlightValue,
	HighlightsOfTypeParams
} from '../types';
import { getRule, ruleTypes } from './rule-registry';
import { getPresence, getTimeWindow } from './pipeline/scope-config';
import { getScopedHighlightsOfType } from './pipeline/fetch-scoped-stats';
import {
	sortHighlights,
	sortByPositionAndTimeWindow
} from './highlight-utils';
import type { StatsTemporalUnit } from '@/app/models/temporal-unit';
import type { ViewedGroup } from '@/app/lib/group-slug';

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
	temporalUnit: StatsTemporalUnit;
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
				const lakeScopeTemporalUnit = noCase(lakeScope) as StatsTemporalUnit;
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
	temporalUnit: StatsTemporalUnit;
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
	temporalUnit: StatsTemporalUnit;
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
	temporalUnit: StatsTemporalUnit;
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
