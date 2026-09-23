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
import { getTopByPropertiesSum } from '../utils/highlight-rules';

type CoreStatsRepository = StatsRepository<CoreStatsResult>;
export const juvs: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.overall,
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map((scope, i) => {
				const centralStatement = `${printProminenceQualifier(scope.ranking)} most juvs ${printTimeQualifier(scope.scope.parentTimeWindow || {})}`;

				return i === 0
					? `${printTemporalUnit(scope.scope.temporalUnit)} with ${centralStatement}`
					: centralStatement;
			});
			return sentenceCase(
				`${sentenceJoin(preambles)}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)} with most juvs`
	},
	descriptor: {
		type: 'juvs',
		unit: 'bird',
		category: 'demographics'
	},
	generator: getTopByPropertiesSum(['pullus_bird_count', 'juv_bird_count']),
	condition: (
		temporalUnit: TemporalUnit,
		parentTimeWindow?: YearMonthRestriction
	) => !parentTimeWindow?.month
};
