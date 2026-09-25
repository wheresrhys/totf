import type { HighlightsGenerator } from '../types';
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
export const encounterCount: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.overall,
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map((scope, i) => {
				const centralStatement = `${printProminenceQualifier(scope.ranking, 'equal')} most ${i === 0 ? 'encounters ' : ''}${printTimeQualifier(scope.scope.parentTimeWindow, 'of', 'of')}${scope.scope.parentTimeWindow?.month && combinedHighlight.scopes[0].scope.temporalUnit === 'day' && i > 0 ? ' session' : ''}`;

				return i === 0
					? `${printTemporalUnit(scope.scope.temporalUnit)} with ${centralStatement}`
					: centralStatement;
			});
			return sentenceCase(
				`${sentenceJoin(preambles)}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			).replace(/  /g, ' ');
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)} with most encounters`
	},
	descriptor: {
		type: 'encounters',
		unit: 'encounter',
		category: 'count'
	},
	generator: getTopByProperty('encounter_count'),
	condition: (temporalUnit: TemporalUnit) => temporalUnit !== 'day'
};
