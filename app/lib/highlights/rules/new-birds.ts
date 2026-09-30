import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const newBirds: HighlightsGenerator = {
	statsSelector: 'coreStats',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				lineItem: ({ scope, ranking, index }) => {
					const centralStatement =
						`${printProminenceQualifier(ranking)} highest${index === 0 ? ' new bird count' : ''} ${printTimeQualifier(scope.parentTimeWindow)}`.trim();

					return index === 0 && !(scope.temporalUnit === 'day')
						? `${printTemporalUnit(scope.temporalUnit)} with ${centralStatement}`
						: centralStatement;
				},
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			`${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)} with most new birds`
	},
	descriptor: {
		type: 'newBirds',
		unit: 'bird',
		category: 'demographics'
	},
	generator: getTopByProperty('new_bird_count'),
	condition: (scope) => !scope.parentTimeWindow?.month
};
