import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const eachSpeciesCount: HighlightsGenerator = {
	// Highest Long- tailed Tit count of 2020, and highest ever: 5 birds
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking, combinedHighlight }) => {
					let result = `${printProminenceQualifier(ranking, 'equal')} highest ${combinedHighlight.species} count `;
					if (scope.temporalUnit !== 'day') {
						result += ` in a ${printTemporalUnit(scope.temporalUnit)}`;
					}
					result += ` ${printTimeQualifier(scope.parentTimeWindow)}`;
					return result;
				},
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking, 'equal')} highest ${printTimeQualifier(scope.parentTimeWindow)}`,
				shouldPrintValue: true
			})
	},

	descriptor: {
		type: 'eachSpeciesCount',
		unit: 'bird',
		category: 'count'
	},
	generator: (rows) => {
		const results = getTopByProperty('bird_count', {
			threshold: 2
		})(rows);
		const max = Math.max(...results.map((result) => result.value as number));
		// Suppresses a low max count that recurs often — see modules/highlights/CLAUDE.md.
		if (max < 5) {
			const occasionsWithMax = results.filter(
				(result) => result.value === max
			).length;
			if (occasionsWithMax >= 2) {
				return [];
			}
		}
		return results;
	},
	condition: (scope) =>
		!(scope.parentTimeWindow?.month && scope.parentTimeWindow?.year),
	speciesUsed: 'grouped',
	presence: {
		species: null,
		general: {
			day: {
				inter: [
					{
						sample: 'day',
						lakes: {
							allTime: 3,
							monthSquashed: 0,
							year: 1
						}
					}
				]
			},
			month: null,
			year: null,
			monthSquashed: null,
			allTime: null
		}
	}
};
