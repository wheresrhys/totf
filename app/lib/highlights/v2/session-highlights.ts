import type {
	HighlightsOfType,
	CherryPickedHighlight,
	YearMonthRestriction,
	HighlightDescriptor,
	HighlightValue,
	CombinedHighlight,
	HighlightCategory
} from './types';
import { getScopedHighlights } from './highlight-generator';

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
			(
				{
					scope: { parentTimeWindow: windowA },
					ranking: { position: positionA, isTied: isTiedA }
				},
				{
					scope: { parentTimeWindow: windowB },
					ranking: { position: positionB, isTied: isTiedB }
				}
			): number => {
				if (positionA === positionB) {
					const windowAScore = timeWindowToNumber(windowA);
					const windowBScore = timeWindowToNumber(windowB);
					return windowBScore - windowAScore;
					// return isTiedA ? 1 : -1;
				} else {
					return positionA - positionB;
				}
			}
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
		if (highlight.scope.parentTimeWindow) {
			const clobberer = highlights.find(
				(potentialClobber) =>
					// don't clobber highlights of a completely different type
					potentialClobber.descriptor.type === highlight.descriptor.type &&
					potentialClobber.descriptor.category ===
						highlight.descriptor.category &&
					potentialClobber.scope.species === highlight.scope.species &&
					// clobberer must be higher ranked than subject, e.g. can't  clobber 1st place with 2nd place
					potentialClobber.ranking.position >= highlight.ranking.position &&
					// only clobber with highlights that are scopedd to all time
					!potentialClobber.scope.parentTimeWindow &&
					// // don't clobber 1st place with 2nd place... hmmm this seems dodgy!
					// !(highlight.ranking.position < potentialClobber.ranking.position) &&
					// don't clobbe if equal position but the more locally scoped item is not tied when the global one is tied
					!(
						highlight.ranking.position === potentialClobber.ranking.position &&
						potentialClobber.ranking.isTied &&
						!highlight.ranking.isTied
					)
			);
			if (clobberer) {
				console.log(highlight, clobberer);
			}
			return !clobberer;
		} else {
			return true;
		}
	});
}

function sortHighlights(highlights: CombinedHighlight[]) {
	return highlights.toSorted((a, b) => {
		const categoryOrdering =
			highlightCategoryOrder.indexOf(b.descriptor.category) -
			highlightCategoryOrder.indexOf(a.descriptor.category);

		if (categoryOrdering) return categoryOrdering;
		if (a.species && !b.species) return 1;
		if (!a.species && b.species) return -1;

		if (b.bestPosition !== a.bestPosition)
			return a.bestPosition - b.bestPosition;
		const windowAScore = timeWindowToNumber(a.scopes[0].scope.parentTimeWindow);
		const windowBScore = timeWindowToNumber(b.scopes[0].scope.parentTimeWindow);
		if (windowAScore !== windowBScore) return windowBScore - windowAScore;

		return b.value.value - a.value.value;
	});
}

async function getAllRelevantHighlights(groupId: number, timePeriod: string) {
	const yearparentTimeWindow = { year: Number(timePeriod.split('-')[0]) };
	const monthparentTimeWindow = {
		month: Number(timePeriod.split('-')[1])
	};
	const allTimeDailyHighlights = await getScopedHighlights({
		temporalUnit: 'day',
		groupId,
		limit: 3
	});
	const yearDailyHighlights = await getScopedHighlights({
		temporalUnit: 'day',
		groupId,
		parentTimeWindow: yearparentTimeWindow,
		limit: 1
	});
	const monthDailyHighlights = await getScopedHighlights({
		temporalUnit: 'day',
		groupId,
		parentTimeWindow: monthparentTimeWindow,
		limit: 3
	});
	return [
		...filterOutIrrelevantHighlights(allTimeDailyHighlights, timePeriod),
		...filterOutIrrelevantHighlights(yearDailyHighlights, timePeriod),
		...filterOutIrrelevantHighlights(monthDailyHighlights, timePeriod)
	];
}

export async function sessionHighlights(
	groupId: number,
	timePeriod: string
): Promise<CombinedHighlight[]> {
	const allRelevantHighlights = await getAllRelevantHighlights(
		groupId,
		timePeriod
	);
	const significantHighlights = removeLessSignificantHighlights(
		allRelevantHighlights
	);
	const combinedHighlights = combineSimilarHighlights(significantHighlights);
	const sortedHighlights = sortHighlights(combinedHighlights);
	return sortedHighlights;
}
