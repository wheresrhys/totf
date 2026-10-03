import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const singleSpeciesEncounters: HighlightsGenerator = {
	statsSelector: 'coreStatsWithSpecies',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking, 'equal')} most encounters of a single species in a ${printTemporalUnit(scope.temporalUnit)} ${printTimeQualifier(scope.parentTimeWindow, { yearConnector: 'in' })}`,
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking, 'equal')} most ${printTimeQualifier(scope.parentTimeWindow, { yearConnector: 'of' })}`,
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Most encounters of a single species`
	},
	descriptor: {
		type: 'singleSpeciesEncounters',
		unit: 'encounter',
		category: 'count',
		speciesUnitMode: 'replace'
	},
	generator: getTopByProperty('encounter_count'),
	condition: (scope) =>
		scope.temporalUnit !== 'day' &&
		!(scope.parentTimeWindow?.month && scope.parentTimeWindow?.year)
};
