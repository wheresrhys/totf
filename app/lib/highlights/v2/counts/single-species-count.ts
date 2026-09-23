import type { HighlightsGenerator, YearMonthRestriction } from '../types';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import type { CoreStatsResult } from '@/app/models/db';
import type { StatsRepository } from '@/app/actions/highlights-data';
import {
	printProminenceQualifier,
	printValue,
	sentenceCase,
	sentenceJoin,
	printTemporalUnit,
	printTimeQualifier
} from '../utils/sentence-builders';
import { getTopByProperty } from '../utils/highlight-rules';

type CoreStatsRepository = StatsRepository<CoreStatsResult>;
export const singleSpeciesCount: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.withSpecies,
	formatters: {
		// -> Highest count of a single species in 2021: 54 Reed Warblers
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map(
				(scope, i) =>
					`${printProminenceQualifier(scope.ranking)} highest ${i === 0 ? printTemporalUnit(scope.scope.temporalUnit) : ''} count for a single species ${printTimeQualifier(scope.scope.parentTimeWindow || {}, 'in')}`
			);
			return sentenceCase(
				`${sentenceJoin(preambles)}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Highest ${printTemporalUnit(highlightsOfType.scope.temporalUnit)} count${highlightsOfType.values.length > 1 ? 's' : ''} for a single species`
	},
	descriptor: {
		type: 'singleSpeciesCount',
		unit: 'bird',
		category: 'count',
		speciesUnitMode: 'replace'
	},
	generator: getTopByProperty('bird_count'),
	condition: (
		temporalUnit: TemporalUnit,
		parentTimeWindow?: YearMonthRestriction
	) => !parentTimeWindow?.month
};
