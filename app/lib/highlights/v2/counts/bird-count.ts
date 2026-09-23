import type { HighlightsGenerator } from '../types';
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
export const birdCount: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.overall,
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map(
				(scope, i) =>
					// todo don't actually need 'for species' here, but keeping for now as may be useful later
					`${printProminenceQualifier(scope.ranking)} busiest ${i === 0 ? printTemporalUnit(scope.scope.temporalUnit) : ''} ${printTimeQualifier(scope.scope.parentTimeWindow || {})} ${scope.scope.species ? `for ${scope.scope.species}` : ''}`
			);
			return sentenceCase(
				`${sentenceJoin(preambles)}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Busiest ${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)}`
	},
	descriptor: {
		type: 'birds',
		unit: 'bird',
		category: 'count'
	},
	generator: getTopByProperty('bird_count')
};
