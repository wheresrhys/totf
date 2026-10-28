import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTimeQualifier,
	printCombinedHighlight,
	type TimeQualifierOptions
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';
const timeQualifierOptions: TimeQualifierOptions = {
	yearConnector: 'of'
};
export const lightestOfSpecies: HighlightsGenerator = {
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking, combinedHighlight }) =>
					`${printProminenceQualifier(ranking)} lightest ${combinedHighlight.species} ${printTimeQualifier(scope.parentTimeWindow, timeQualifierOptions)}`,
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking)} lightest ${printTimeQualifier(scope.parentTimeWindow, timeQualifierOptions)}`,
				shouldPrintValue: true
			})
	},
	descriptor: {
		type: 'lightestOfSpecies',
		unit: 'g',
		category: 'biometrics',
		smallestWins: true
	},
	generator: (rows) => {
		const results = getTopByProperty('min_weight', {
			smallestWins: true
		})(rows);
		// avoid generating highlights when there are actually very few birds to build a reasonable data set
		return results.length >= 10 ? results : [];
	},
	condition: (scope) => scope.temporalUnit === 'day',
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
