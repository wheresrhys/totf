import type { HighlightsGenerator } from '../types';
import type { CoreStatsResult } from '@/app/models/db';
import type { StatsRepository } from '@/app/actions/highlights-data';
import {
	printProminenceQualifier,
	printValue,
	sentenceCase,
	sentenceJoin,
	printTemporalUnit,
	printTimeQualifier,
	printFullMonthName
} from '../utils/sentence-builders';
import { getTopByProperty } from '../utils/highlight-rules';

type CoreStatsRepository = StatsRepository<CoreStatsResult>;
export const birdCount: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.overall,
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map((scope, i) => {
				let result = `${printProminenceQualifier(scope.ranking)} busiest `;

				if (scope.scope.parentTimeWindow?.month) {
					result += `${printFullMonthName(scope.scope.parentTimeWindow?.month)} ${printTemporalUnit(scope.scope.temporalUnit)} ever`;
				} else {
					result +=
						+`${i === 0 ? printTemporalUnit(scope.scope.temporalUnit) : ''} ${printTimeQualifier(scope.scope.parentTimeWindow)}`;
				}
				return result;
			});
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
