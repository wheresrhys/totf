import type { CombinedHighlight, NewHighlightValue } from '../../types';
import { getRule } from '../rule-registry';
import { sortByPositionAndTimeWindow } from '../highlight-utils';

// Drops a highlight that a broader-scoped sibling already covers for the same metric — see
// modules/highlights/CLAUDE.md's "Pipeline phases" for the full clobbering rules.
export function removeLessSignificantHighlights(
	highlights: NewHighlightValue[]
): NewHighlightValue[] {
	return highlights.filter((highlight, i) => {
		if (!highlight.scope.parentTimeWindow) {
			return true;
		}

		return !highlights.some(
			(potentialClobber, j) =>
				i !== j &&
				potentialClobber.descriptor.type === highlight.descriptor.type &&
				potentialClobber.descriptor.category ===
					highlight.descriptor.category &&
				potentialClobber.scope.temporalUnit === highlight.scope.temporalUnit &&
				potentialClobber.scope.species === highlight.scope.species &&
				potentialClobber.ranking.position >= highlight.ranking.position &&
				!potentialClobber.scope.parentTimeWindow &&
				!(
					highlight.ranking.position === potentialClobber.ranking.position &&
					potentialClobber.ranking.isTied &&
					!highlight.ranking.isTied
				)
		);
	});
}

export function combineSimilarHighlights(
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
