import type {
	HighlightsOfType,
	CherryPickedHighlight,
	YearMonthRestriction,
	HighlightDescriptor,
	HighlightValue,
	CombinedHighlight,
	HighlightCategory
} from '../types';
import { getHighlightsWithinTimeWindow } from './highlight-generator';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
const highlightCategoryOrder: HighlightCategory[] = [
	'rarity',
	'count',
	'biometrics'
];

function calculatePosition(
	siblingHighlights: HighlightValue[],
	highlightIndex: number
) {
	const activeHighlight = siblingHighlights[highlightIndex];
	const activeValue = activeHighlight.value;
	const allValues = [
		...new Set(siblingHighlights.map(({ value }) => value))
	].sort((a, b) => b - a);
	const position = allValues.indexOf(activeValue) + 1;
	const isTied =
		siblingHighlights.filter(({ value }) => value === activeValue).length > 1;

	return { position, isTied };
}

function filterOutIrrelevantHighlights(
	highlights: HighlightsOfType[],
	timePeriod: string
) {
	const relevantHighlights: CherryPickedHighlight[] = [];

	highlights.forEach((highlightWrapper) => {
		const relevantHighlightIndex = highlightWrapper.values.findIndex(
			(value) => value.timePeriod === timePeriod
		);
		const relevantHighlight = highlightWrapper.values[relevantHighlightIndex];

		if (relevantHighlightIndex > -1) {
			relevantHighlights.push({
				...highlightWrapper,
				scope: {
					...highlightWrapper.scope
				},
				value: relevantHighlight,
				ranking: {
					...calculatePosition(highlightWrapper.values, relevantHighlightIndex),
					siblingHighlights: highlightWrapper.values,
					highlightIndex: relevantHighlightIndex
				}
			});
		}
	});
	return relevantHighlights;
}

function descriptorToString(descriptor: HighlightDescriptor): string {
	return (Object.keys(descriptor) as (keyof HighlightDescriptor)[])
		.sort()
		.map((key) => String(descriptor[key]))
		.join(':');
}

function timeWindowToNumber(
	timeWindow: YearMonthRestriction | undefined
): number {
	if (timeWindow?.month) return 10;
	if (timeWindow?.year) return 1;
	return 100;
}

type PositionAndTimeWindow = {
	position: number;
	window?: YearMonthRestriction;
};

function sortByPositionAndTimeWindow(
	a: PositionAndTimeWindow,
	b: PositionAndTimeWindow
) {
	if (a.position !== b.position) {
		return a.position - b.position;
	} else {
		const windowAScore = timeWindowToNumber(a.window);
		const windowBScore = timeWindowToNumber(b.window);
		return windowBScore - windowAScore;
	}
}

// Folds every highlight describing the same metric for the same species into one
// line, whatever scopes it was found at — "busiest session ever AND busiest of
// 2020" becomes a single sentence with two scopes rather than two sentences. The
// grouping key is the descriptor (category + type + unit + speciesUnitMode)
// *plus* value.species, so what it combines is always one metric, one species,
// several scopes.
//
// That is the whole shape of combining this pipeline supports, and two kinds of
// editorial folding are therefore inexpressible here. Both existed in the v1
// Rarities implementation (app/lib/highlights/rarities/, removed when those
// rules migrated to rules/first-species-record.ts, only-species-record.ts and
// rare-species.ts) and neither survived the migration — they are *lost*
// behaviour, not relocated behaviour, so this is the note that stops the next
// person reading the gap as an accident:
//
//  - **Cross-species folding.** v1's combineFirstEverHighlights,
//    combineFirstOfYearHighlights and combineOnlyOfYearHighlights each collapsed
//    several species' identical lines into one — "First ever Chiffchaff,
//    Blackcap and Whitethroat records" instead of three separate sentences. The
//    key here includes value.species precisely so that two species never merge,
//    so there is no key under which those three lines are siblings. This matters
//    most on a year's first session, where every returning species is a first of
//    the year and v1 printed one line for the lot.
//  - **Cross-type folding.** v1's combineFirstRareHighlights (the "MEGA" badge)
//    fused a *different metric* for the same species — a first/only record plus
//    that species' rare-species line — into one headline: "MEGA — Only Meadow
//    Pipit records of 2023 (only 3 records ever)". Two metrics about one species
//    is not "the same metric at a wider scope", which is the only relationship
//    scopes[] can express, so the two now print as separate lines.
//
// Neither is a missing feature of this function so much as a different idea:
// combining here is about one fact seen through several windows, while both of
// the above are about several distinct facts sharing a subject. Adding either
// would mean a second combining pass with its own notion of identity — don't
// bolt it onto this one.
function combineSimilarHighlights(
	highlights: CherryPickedHighlight[]
): CombinedHighlight[] {
	const groupedByDescriptor: Map<string, CherryPickedHighlight[]> = new Map();
	highlights.forEach((highlight) => {
		const mapKey = `${descriptorToString(highlight.descriptor)}-${highlight.value.species}`;
		if (groupedByDescriptor.has(mapKey)) {
			groupedByDescriptor.get(mapKey)?.push(highlight);
		} else {
			groupedByDescriptor.set(mapKey, [highlight]);
		}
	});

	return [...groupedByDescriptor.values()].map((highlights) => {
		highlights.sort(
			(a: CherryPickedHighlight, b: CherryPickedHighlight): number =>
				sortByPositionAndTimeWindow(
					{ position: a.ranking.position, window: a.scope.parentTimeWindow },
					{ position: b.ranking.position, window: b.scope.parentTimeWindow }
				)
		);
		return {
			formatters: highlights[0].formatters,
			descriptor: highlights[0].descriptor,
			value: highlights[0].value,
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

function removeLessSignificantHighlights(
	highlights: CherryPickedHighlight[]
): CherryPickedHighlight[] {
	return highlights.filter((highlight) => {
		if (!highlight.scope.parentTimeWindow) {
			return true;
		}
		return !highlights.some(
			(potentialClobber) =>
				// don't clobber highlights of a completely different type
				potentialClobber.descriptor.type === highlight.descriptor.type &&
				potentialClobber.descriptor.category ===
					highlight.descriptor.category &&
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

function sortHighlights(highlights: CombinedHighlight[]) {
	return highlights.toSorted(
		(a: CombinedHighlight, b: CombinedHighlight): number => {
			const categoryOrdering =
				highlightCategoryOrder.indexOf(b.descriptor.category) -
				highlightCategoryOrder.indexOf(a.descriptor.category);

			if (categoryOrdering) return categoryOrdering;
			if (a.species && !b.species) return 1;
			if (!a.species && b.species) return -1;
			const posWindowSorVal = sortByPositionAndTimeWindow(
				{
					position: a.bestPosition,
					window: a.scopes[0].scope.parentTimeWindow
				},
				{
					position: b.bestPosition,
					window: b.scopes[0].scope.parentTimeWindow
				}
			);
			return posWindowSorVal ? posWindowSorVal : b.value.value - a.value.value;
		}
	);
}

async function getAllRelevantHighlights(
	groupId: number,
	timePeriod: string,
	temporalUnit: TemporalUnit
) {
	const yearparentTimeWindow = { year: Number(timePeriod.split('-')[0]) };
	const monthparentTimeWindow = {
		month: Number(timePeriod.split('-')[1])
	};
	const allTimeHighlights = await getHighlightsWithinTimeWindow({
		temporalUnit: temporalUnit,
		groupId,
		limit: 3,
		includePerSpecies: true
	});
	const yearHighlights =
		temporalUnit !== 'year'
			? await getHighlightsWithinTimeWindow({
					temporalUnit: temporalUnit,
					groupId,
					parentTimeWindow: yearparentTimeWindow,
					limit: 1,
					includePerSpecies: true
				})
			: [];
	const monthHighlights =
		temporalUnit === 'day'
			? await getHighlightsWithinTimeWindow({
					temporalUnit: temporalUnit,
					groupId,
					parentTimeWindow: monthparentTimeWindow,
					limit: 3,
					includePerSpecies: true
				})
			: [];
	return filterOutIrrelevantHighlights(
		[...allTimeHighlights, ...yearHighlights, ...monthHighlights],
		timePeriod
	);
}

export async function getCondensedHighlightsAtTimePeriod(
	groupId: number,
	timePeriod: string,
	temporalUnit: TemporalUnit
): Promise<CombinedHighlight[]> {
	const allRelevantHighlights = await getAllRelevantHighlights(
		groupId,
		timePeriod,
		temporalUnit
	);
	const significantHighlights = removeLessSignificantHighlights(
		allRelevantHighlights
	);
	const combinedHighlights = combineSimilarHighlights(significantHighlights);
	const sortedHighlights = sortHighlights(combinedHighlights);
	return sortedHighlights;
}
