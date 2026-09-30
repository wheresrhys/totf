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
				lineItem: ({ scope, ranking, index }) =>
					// todo don't actually need 'for species' here, but keeping for now as may be useful later
					`${printProminenceQualifier(ranking)} most varied${index === 0 ? ` ${printTemporalUnit(scope.temporalUnit)}` : ''} ${printTimeQualifier(scope.parentTimeWindow)}`,
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Most varied ${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)}`
	},
	descriptor: {
		type: 'species',
		unit: 'species',
		category: 'count'
	},
	generator: getTopByProperty('species_count'),
	condition: (scope) => !scope.parentTimeWindow?.month
};
