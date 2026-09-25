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
export const newBirds: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.overall,
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map((scope, i) => {
				const centralStatement =
					`${printProminenceQualifier(scope.ranking)} highest${i === 0 ? ' new bird count' : ''} ${printTimeQualifier(scope.scope.parentTimeWindow)}`.trim();

				return i === 0 && !(scope.scope.temporalUnit === 'day')
					? `${printTemporalUnit(scope.scope.temporalUnit)} with ${centralStatement}`
					: centralStatement;
			});
			return sentenceCase(
				`${sentenceJoin(preambles)}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)} with most new birds`
	},
	descriptor: {
		type: 'newBirds',
		unit: 'bird',
		category: 'demographics'
	},
	generator: getTopByProperty('new_bird_count'),
	condition: (
		temporalUnit: TemporalUnit,
		parentTimeWindow?: YearMonthRestriction
	) => !parentTimeWindow?.month
};
