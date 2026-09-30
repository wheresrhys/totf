import type { HighlightsGenerator } from '../types';
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

export const encounterCount: HighlightsGenerator = {
	statsSelector: 'coreStats',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preValue = printCombinedHighlight(combinedHighlight, {
				lineItem: ({ scope, ranking, index, combinedHighlight }) => {
					const centralStatement = `${printProminenceQualifier(ranking, 'equal')} most ${index === 0 ? 'encounters ' : ''}${printTimeQualifier(
						scope.parentTimeWindow,
						{
							yearConnector: 'of',
							monthConnector: 'of'
						}
					)}${scope.parentTimeWindow?.month && combinedHighlight.scopes[0].scope.temporalUnit === 'day' && index > 0 ? ' session' : ''}`;

					return index === 0
						? `${printTemporalUnit(scope.temporalUnit)} with ${centralStatement}`
						: centralStatement;
				}
			});
			return sentenceCase(
				`${preValue}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			).replace(/  /g, ' ');
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)} with most encounters`
	},
	descriptor: {
		type: 'encounters',
		unit: 'encounter',
		category: 'count'
	},
	generator: getTopByProperty('encounter_count'),
	condition: (scope) => scope.temporalUnit !== 'day'
};
