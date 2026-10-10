import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByPropertiesSum } from '../lib/rule-utils';

export const eachSpeciesJuvs: HighlightsGenerator = {
	statsSelector: 'coreStatsBySpecies',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking, combinedHighlight }) => {
					let result = `${printProminenceQualifier(ranking, 'equal')} highest juv ${combinedHighlight.species} count `;
					if (scope.temporalUnit !== 'day') {
						result += ` in a ${printTemporalUnit(scope.temporalUnit)}`;
					}
					result += ` ${printTimeQualifier(scope.parentTimeWindow)}`;
					return result;
				},
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking, 'equal')} highest ${printTimeQualifier(scope.parentTimeWindow)}`,
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Highest juv count${highlightsOfType.values.length > 1 ? 's' : ''} for ${highlightsOfType.values[0].species}`
	},
	descriptor: {
		type: 'eachSpeciesJuvs',
		unit: 'bird',
		category: 'demographics'
	},
	generator: getTopByPropertiesSum(['pullus_bird_count', 'juv_bird_count'], {
		threshold: 3
	}),
	limit: 1,
	condition: (scope) =>
		!(scope.parentTimeWindow?.month && scope.parentTimeWindow?.year),
	rpcName: 'core_stats',
	speciesUsed: 'grouped',
	presence: {
		species: null,
		general: {
			day: {
				perDay: {
					relativeToAllTime: 1,
					relativeToYear: 1
				}
			},
			month: null,
			year: null,
			allTimeMonth: null,
			allTime: null
		}
	}
};
