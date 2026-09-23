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
	printTimeQualifier,
	pluraliseSpecies
} from '../utils/sentence-builders';
import { getTopByProperty } from '../utils/highlight-rules';

type CoreStatsRepository = StatsRepository<CoreStatsResult>;
export const eachSpeciesCount: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.bySpecies,

	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map(
				(scope, i) =>
					`${printProminenceQualifier(scope.ranking)} ${i === 0 ? `most ${pluraliseSpecies(combinedHighlight.species as string)} in a ${printTemporalUnit(scope.scope.temporalUnit)}` : 'most '} ${printTimeQualifier(scope.scope.parentTimeWindow || {})}`
			);
			return sentenceCase(
				`${sentenceJoin(preambles)}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Most ${pluraliseSpecies(highlightsOfType.scope.species as string)} in a ${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)}`
	},

	descriptor: {
		type: 'eachSpeciesCount',
		unit: 'bird',
		category: 'count'
	},
	generator: getTopByProperty('bird_count', { threshold: 1 }),
	condition: (
		temporalUnit: TemporalUnit,
		parentTimeWindow?: YearMonthRestriction
	) => !parentTimeWindow?.month
};
