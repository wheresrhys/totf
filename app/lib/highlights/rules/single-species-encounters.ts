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

export const singleSpeciesEncounters: HighlightsGenerator = {
	statsSelector: 'coreStatsWithSpecies',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preValue = printCombinedHighlight(combinedHighlight, {
				lineItem: ({ scope, ranking, index }) =>
					`${printProminenceQualifier(ranking, 'equal')} most ${index === 0 ? `encounters of a single species in a ${printTemporalUnit(scope.temporalUnit)} ` : ''}${printTimeQualifier(scope.parentTimeWindow, { yearConnector: index === 0 ? 'in' : 'of' })}`
			});
			return sentenceCase(
				`${preValue}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Most encounters of a single species in a ${printTemporalUnit(highlightsOfType.scope.temporalUnit)}`
	},
	descriptor: {
		type: 'singleSpeciesEncounters',
		unit: 'encounter',
		category: 'count',
		speciesUnitMode: 'replace'
	},
	generator: getTopByProperty('encounter_count'),
	condition: (scope) =>
		scope.temporalUnit !== 'day' && !scope.parentTimeWindow?.month
};
