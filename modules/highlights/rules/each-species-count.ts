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
		// avoids outputting a highlight for a low count if that count is quite common
		// e.g. we catch 2 kingfishers every now and then, but never more than 2. No need to highlight the
		// catch of 2 every time it happens
		// conversely, we have only ever caught a amx of 2 redpoll, but this is (maybe?) worth mentioning
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
							allTimeMonth: 0,
							year: 1
						}
					}
				]
			},
			month: null,
			year: null,
			allTimeMonth: null,
			allTime: null
		}
	}
};
