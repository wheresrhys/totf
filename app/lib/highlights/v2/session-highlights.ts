import type {
	HighlightsOfType,
	CherryPickedHighlight,
	YearMonthRestriction,
	HighlightDescriptor,
	HighlightValue,
	CombinedHighlights
} from './types';
import { getHighlightsByTemporalUnit } from './highlight-generator';
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
): CombinedHighlights[] {
	const groupedByDescriptor: Map<string, CherryPickedHighlight[]> = new Map();
	highlights.forEach((highlight) => {
		const mapKey = descriptorToString(highlight.descriptor);
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
			descriptor: highlights[0].descriptor,
			value: highlights[0].value,
			scopes: highlights.map((highlight) => ({
				scope: highlight.scope,
				ranking: highlight.ranking
			}))
		};
	});
}

export async function sessionHighlights(
	groupId: number,
	timePeriod: string
): Promise<CombinedHighlights[]> {
	const yearparentTimeWindow = { year: Number(timePeriod.split('-')[0]) };
	const monthparentTimeWindow = {
		month: Number(timePeriod.split('-')[1])
	};
	const allTimeDailyHighlights = await getHighlightsByTemporalUnit({
		temporalUnit: 'day',
		groupId,
		limit: 5
	});
	const yearDailyHighlights = await getHighlightsByTemporalUnit({
		temporalUnit: 'day',
		groupId,
		parentTimeWindow: yearparentTimeWindow,
		limit: 3
	});
	const monthDailyHighlights = await getHighlightsByTemporalUnit({
		temporalUnit: 'day',
		groupId,
		parentTimeWindow: monthparentTimeWindow,
		limit: 3
	});
	const allRelevantHighlights = [
		...filterOutIrrelevantHighlights(allTimeDailyHighlights, timePeriod),
		...filterOutIrrelevantHighlights(yearDailyHighlights, timePeriod),
		...filterOutIrrelevantHighlights(monthDailyHighlights, timePeriod)
	];
	const filteredHighlights = allRelevantHighlights.filter((highlight) => {
		if (highlight.scope.parentTimeWindow) {
			const isClobbered = allRelevantHighlights.some(
				(potentialClobber) =>
					potentialClobber.descriptor.type === highlight.descriptor.type &&
					potentialClobber.descriptor.category ===
						highlight.descriptor.category &&
					!potentialClobber.scope.parentTimeWindow &&
					!(highlight.ranking.position < potentialClobber.ranking.position) &&
					!(
						highlight.ranking.position === potentialClobber.ranking.position &&
						potentialClobber.ranking.isTied &&
						!highlight.ranking.isTied
					)
			);
			return !isClobbered;
		} else {
			return true;
		}
	});

	return combineSimilarHighlights(filteredHighlights).toSorted((a, b) => {
		if (
			a.descriptor.category + a.descriptor.type ===
			b.descriptor.category + b.descriptor.type
		)
			return 0;
		return a.descriptor.category + a.descriptor.type >
			b.descriptor.category + b.descriptor.type
			? 1
			: -1;
	});
}
