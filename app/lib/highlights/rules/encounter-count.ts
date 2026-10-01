import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight,
	sentenceCase,
	type TimeQualifierOptions
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';
const timeQualifierOptions: TimeQualifierOptions = {
	yearConnector: 'of',
	monthConnector: 'of'
};
export const encounterCount: HighlightsGenerator = {
	statsSelector: 'coreStats',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking }) =>
					`${printTemporalUnit(scope.temporalUnit)} with ${printProminenceQualifier(ranking, 'equal')} most encounters ${printTimeQualifier(
						scope.parentTimeWindow,
						timeQualifierOptions
					)}`,
				lineItem: ({ scope, ranking, combinedHighlight }) =>
					`${printProminenceQualifier(ranking, 'equal')} most ${printTimeQualifier(
						scope.parentTimeWindow,
						timeQualifierOptions
					)}${scope.parentTimeWindow?.month && combinedHighlight.scopes[0].scope.temporalUnit === 'day' ? ' session' : ''}`,
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			sentenceCase(
				`${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)} with most encounters`
			)
	},
	descriptor: {
		type: 'encounters',
		unit: 'encounter',
		category: 'count'
	},
	generator: getTopByProperty('encounter_count'),
	condition: (scope) => scope.temporalUnit !== 'day'
};
