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
export const speciesCount: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.overall,
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map(
				(scope, i) =>
					// todo don't actually need 'for species' here, but keeping for now as may be useful later
					`${printProminenceQualifier(scope.ranking)} most varied${i === 0 ? ` ${printTemporalUnit(scope.scope.temporalUnit)}` : ''} ${printTimeQualifier(scope.scope.parentTimeWindow)}`
			);
			return sentenceCase(
				`${sentenceJoin(preambles)}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Most varied ${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)}`
	},
	descriptor: {
		type: 'species',
		unit: 'species',
		category: 'count'
	},
	generator: getTopByProperty('species_count'),
	condition: (
		temporalUnit: TemporalUnit,
		parentTimeWindow?: YearMonthRestriction
	) => !parentTimeWindow?.month
};
