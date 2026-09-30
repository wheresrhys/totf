import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const singleSpeciesCount: HighlightsGenerator = {
	statsSelector: 'coreStatsWithSpecies',
	formatters: {
		// -> Highest count of a single species in 2021: 54 Reed Warblers
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				lineItem: ({ scope, ranking, index }) =>
					`${printProminenceQualifier(ranking)} highest ${index === 0 ? `single species ${printTemporalUnit(scope.temporalUnit)} count ` : ''}${printTimeQualifier(scope.parentTimeWindow, { yearConnector: 'of' })}`,
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Highest ${printTemporalUnit(highlightsOfType.scope.temporalUnit)} count${highlightsOfType.values.length > 1 ? 's' : ''} for a single species`
	},
	descriptor: {
		type: 'singleSpeciesCount',
		unit: 'bird',
		category: 'count',
		speciesUnitMode: 'replace'
	},
	generator: getTopByProperty('bird_count', { threshold: 3 }),
	condition: (scope) => !scope.parentTimeWindow?.month
};
