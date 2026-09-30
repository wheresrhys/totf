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
import { getTopByPropertiesSum } from '../lib/rule-utils';

export const juvs: HighlightsGenerator = {
	statsSelector: 'coreStats',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				lineItem: ({ scope, ranking, index }) => {
					const centralStatement =
						`${printProminenceQualifier(ranking, 'equal')} most${index === 0 ? ' juvs' : ''} ${printTimeQualifier(scope.parentTimeWindow)}`.trim();

					return index === 0
						? `${printTemporalUnit(scope.temporalUnit)} with ${centralStatement}`
						: centralStatement;
				},
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			`${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)} with most juvs`
	},
	descriptor: {
		type: 'juvs',
		unit: 'bird',
		category: 'demographics'
	},
	generator: getTopByPropertiesSum(['pullus_bird_count', 'juv_bird_count']),
	condition: (scope) => !scope.parentTimeWindow?.month
};
