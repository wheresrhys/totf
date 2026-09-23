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
import { getTopByPropertiesSum } from '../utils/highlight-rules';

type CoreStatsRepository = StatsRepository<CoreStatsResult>;
export const eachSpeciesJuvs: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.bySpecies,
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map((scope, i) => {
				let result = `${printProminenceQualifier(scope.ranking)} highest `;
				if (i === 0) {
					result += `juv ${combinedHighlight.species} count `;
					if (combinedHighlight.scopes[0].scope.temporalUnit !== 'day') {
						result += ` in a ${printTemporalUnit(scope.scope.temporalUnit)}`;
					}
				}
				result += printTimeQualifier(scope.scope.parentTimeWindow);
				return result;
			});
			return sentenceCase(
				`${sentenceJoin(preambles)}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Highest juv ${highlightsOfType.scope.species} count in a ${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)}`
	},
	descriptor: {
		type: 'eachSpeciesJuvs',
		unit: 'bird',
		category: 'demographics'
	},
	generator: getTopByPropertiesSum(['pullus_bird_count', 'juv_bird_count']),
	limit: 1,
	condition: (
		temporalUnit: TemporalUnit,
		parentTimeWindow?: YearMonthRestriction
	) => !parentTimeWindow?.month
};
