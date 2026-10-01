import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight,
	sentenceCase
} from '../lib/printer-utils';
import { getTopByPropertiesSum } from '../lib/rule-utils';

export const juvs: HighlightsGenerator = {
	statsSelector: 'coreStats',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking }) =>
					`${printTemporalUnit(scope.temporalUnit)} with ${printProminenceQualifier(ranking, 'equal')} most juvs ${printTimeQualifier(scope.parentTimeWindow)}`,
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking, 'equal')} most ${printTimeQualifier(scope.parentTimeWindow)}`,
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			sentenceCase(
				`${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)} with most juvs`
			)
	},
	descriptor: {
		type: 'juvs',
		unit: 'bird',
		category: 'demographics'
	},
	generator: getTopByPropertiesSum(['pullus_bird_count', 'juv_bird_count']),
	condition: (scope) => !scope.parentTimeWindow?.month
};
