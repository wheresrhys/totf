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
				firstLineItem: ({ scope, ranking }) => {
					const temporalUnitQualifier =
						scope.temporalUnit === 'day'
							? ''
							: `${printTemporalUnit(scope.temporalUnit)} with`;
					return `${temporalUnitQualifier} ${printProminenceQualifier(ranking)} highest new bird count ${printTimeQualifier(scope.parentTimeWindow)}`;
				},
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking)} highest ${printTimeQualifier(scope.parentTimeWindow)}`,
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
