import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const eachSpeciesCount: HighlightsGenerator = {
	statsSelector: 'coreStatsBySpecies',
	// Highest Long- tailed Tit count of 2020, and highest ever: 5 birds
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking, combinedHighlight }) => {
					let result = `${printProminenceQualifier(ranking, 'equal')} highest ${combinedHighlight.species} count `;
					if (scope.temporalUnit !== 'day') {
						result += ` in a ${printTemporalUnit(scope.temporalUnit)}`;
					}
					result += printTimeQualifier(scope.parentTimeWindow);
					return result;
				},
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking, 'equal')} highest ${printTimeQualifier(scope.parentTimeWindow)}`,
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Highest count${highlightsOfType.values.length > 1 ? 's' : ''} for ${highlightsOfType.values[0].species}`
	},

	descriptor: {
		type: 'eachSpeciesCount',
		unit: 'bird',
		category: 'count'
	},
	generator: getTopByProperty('bird_count', { threshold: 2 }),
	condition: (scope) => !scope.parentTimeWindow?.month
};
