import type { HighlightsGenerator, YearMonthRestriction } from '../types';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { CoreStatsResult } from '@/app/models/db';
import type { StatsRepository } from '@/app/actions/stats-cache';
import {
	printProminenceQualifier,
	printValue,
	sentenceCase,
	sentenceJoin,
	printTemporalUnit,
	printTimeQualifier
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

type CoreStatsRepository = StatsRepository<CoreStatsResult>;
export const singleSpeciesEncounters: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.withSpecies,
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map(
				(scope, i) =>
					`${printProminenceQualifier(scope.ranking)} encounters of a single species ${i === 0 ? `in a ${printTemporalUnit(scope.scope.temporalUnit)}` : ''} ${printTimeQualifier(scope.scope.parentTimeWindow)}`
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
