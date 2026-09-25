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
export const eachSpeciesCount: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.bySpecies,
	// Highest Long- tailed Tit count of 2020, and highest ever: 5 birds
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map((scope, i) => {
				let result = `${printProminenceQualifier(scope.ranking, 'equal')} highest `;
				if (i === 0) {
					result += `${combinedHighlight.species} count `;
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
			`Highest ${highlightsOfType.scope.species} count in a ${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)}`
	},

	descriptor: {
		type: 'eachSpeciesCount',
		unit: 'bird',
		category: 'count'
	},
	generator: getTopByProperty('bird_count', { threshold: 2 }),
	condition: (
		temporalUnit: TemporalUnit,
		parentTimeWindow?: YearMonthRestriction
	) => !parentTimeWindow?.month
};
