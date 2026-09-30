import type { HighlightsGenerator, YearMonthRestriction } from '../types';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import {
	printProminenceQualifier,
	printValue,
	sentenceCase,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const newBirds: HighlightsGenerator = {
	statsSelector: 'coreStats',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preValue = printCombinedHighlight(combinedHighlight, {
				lineItem: ({ scope, ranking, index }) => {
					const centralStatement =
						`${printProminenceQualifier(ranking)} highest${index === 0 ? ' new bird count' : ''} ${printTimeQualifier(scope.parentTimeWindow)}`.trim();

					return index === 0 && !(scope.temporalUnit === 'day')
						? `${printTemporalUnit(scope.temporalUnit)} with ${centralStatement}`
						: centralStatement;
				}
			});
			return sentenceCase(
				`${preValue}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			);
		},
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
