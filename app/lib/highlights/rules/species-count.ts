import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const speciesCount: HighlightsGenerator = {
	statsSelector: 'coreStats',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking)} most varied ${printTemporalUnit(scope.temporalUnit)} ${printTimeQualifier(scope.parentTimeWindow)}`,
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking)} most varied ${printTimeQualifier(scope.parentTimeWindow)}`,
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) => `Most varied`
	},
	descriptor: {
		type: 'species',
		unit: 'species',
		category: 'count'
	},
	generator: getTopByProperty('species_count'),
	condition: (scope) => !scope.parentTimeWindow?.month
};
