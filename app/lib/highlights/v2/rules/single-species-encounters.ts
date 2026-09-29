import type { HighlightsGenerator, YearMonthRestriction } from '../types';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import {
	printProminenceQualifier,
	printValue,
	sentenceCase,
	sentenceJoin,
	printTemporalUnit,
	printTimeQualifier
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

import type { EnhancedStatsRepository } from '../types';
export const singleSpeciesEncounters: HighlightsGenerator = {
	statsSelector: (stats: EnhancedStatsRepository) => stats.coreStatsWithSpecies,
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map(
				(scope, i) =>
					`${printProminenceQualifier(scope.ranking, 'equal')} most ${i === 0 ? `encounters of a single species in a ${printTemporalUnit(scope.scope.temporalUnit)} ` : ''}${printTimeQualifier(scope.scope.parentTimeWindow, i === 0 ? 'in' : 'of')}`
			);
			return sentenceCase(
				`${sentenceJoin(preambles)}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
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
	condition: (
		temporalUnit: TemporalUnit,
		parentTimeWindow?: YearMonthRestriction
	) => temporalUnit !== 'day' && !parentTimeWindow?.month
};
