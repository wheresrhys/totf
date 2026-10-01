import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight,
	type TimeQualifierOptions
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

const timeQualifierOptions: TimeQualifierOptions = { yearConnector: 'of' };
export const singleSpeciesCount: HighlightsGenerator = {
	statsSelector: 'coreStatsWithSpecies',
	formatters: {
		// -> Highest count of a single species in 2021: 54 Reed Warblers
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking)} highest single species ${printTemporalUnit(scope.temporalUnit)} count ${printTimeQualifier(scope.parentTimeWindow, timeQualifierOptions)}`,
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking)} highest ${printTimeQualifier(scope.parentTimeWindow, timeQualifierOptions)}`,
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Most individuals of a single species`
	},
	descriptor: {
		type: 'singleSpeciesCount',
		unit: 'bird',
		category: 'count',
		speciesUnitMode: 'replace'
	},
	generator: getTopByProperty('bird_count', { threshold: 3 }),
	condition: (scope) =>
		!(scope.parentTimeWindow?.month && scope.parentTimeWindow?.year)
};
