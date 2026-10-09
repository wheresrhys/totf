import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printFullMonthName,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const birdCount: HighlightsGenerator = {
	statsSelector: 'coreStats',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking }) => {
					let result = `${printProminenceQualifier(ranking)} busiest `;

					if (scope.parentTimeWindow?.month) {
						result += `${printFullMonthName(scope.parentTimeWindow?.month)} ${printTemporalUnit(scope.temporalUnit)} ever`;
					} else {
						result += `${printTemporalUnit(scope.temporalUnit)} ${printTimeQualifier(scope.parentTimeWindow)}`;
					}
					return result;
				},
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking)} busiest ${printTimeQualifier(scope.parentTimeWindow)}`,
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			highlightsOfType.scope.temporalUnit === 'day'
				? 'Busiest'
				: 'Most individuals'
	},
	descriptor: {
		type: 'birds',
		unit: 'bird',
		category: 'count'
	},
	generator: getTopByProperty('bird_count'),
	rpcName: 'core_stats',
	speciesUsed: 'none',
	presence: {
		general: {
			day: {
				perDay: {
					relativeToAllTime: 3,
					relativeToAllTimeMonth: 3,
					relativeToYear: 3
				}
			}
		}
	}
};
