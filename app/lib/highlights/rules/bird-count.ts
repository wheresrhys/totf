import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printValue,
	sentenceCase,
	printTemporalUnit,
	printTimeQualifier,
	printFullMonthName,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const birdCount: HighlightsGenerator = {
	statsSelector: 'coreStats',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preValue = printCombinedHighlight(combinedHighlight, {
				lineItem: ({ scope, ranking, index }) => {
					let result = `${printProminenceQualifier(ranking)} busiest `;

					if (scope.parentTimeWindow?.month) {
						if (index === 0) {
							result += `${printFullMonthName(scope.parentTimeWindow?.month)} ${printTemporalUnit(scope.temporalUnit)} ever`;
						} else {
							result += `in any ${printFullMonthName(scope.parentTimeWindow?.month)}`;
						}
					} else {
						result += `${index === 0 ? printTemporalUnit(scope.temporalUnit) : ''} ${printTimeQualifier(scope.parentTimeWindow)}`;
					}
					return result;
				}
			});
			return sentenceCase(
				`${preValue}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			).replace(/  /g, ' ');
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Busiest ${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)}`
	},
	descriptor: {
		type: 'birds',
		unit: 'bird',
		category: 'count'
	},
	generator: getTopByProperty('bird_count')
};
