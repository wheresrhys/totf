import type { HighlightsGenerator } from '../types';
import type { BiometricsStatsResult } from '@/app/models/db';
import {
	printProminenceQualifier,
	printValue,
	sentenceCase,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const heaviestOfSpecies: HighlightsGenerator = {
	statsSelector: 'biometricsStatsBySpecies',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preValue = printCombinedHighlight(combinedHighlight, {
				lineItem: ({ scope, ranking, index, combinedHighlight }) =>
					`${printProminenceQualifier(ranking)} heaviest${index === 0 ? ` ${combinedHighlight.species}` : ''} ${printTimeQualifier(scope.parentTimeWindow, { yearConnector: 'of' })}`
			});
			return sentenceCase(
				`${preValue}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Heaviest ${printTemporalUnit(highlightsOfType.scope.temporalUnit)} count${highlightsOfType.values.length > 1 ? 's' : ''} for a single species`
	},
	descriptor: {
		type: 'heaviestOfSpecies',
		unit: 'g',
		category: 'biometrics'
	},
	generator: getTopByProperty<BiometricsStatsResult>('max_weight', {
		threshold: 3
	})
};
