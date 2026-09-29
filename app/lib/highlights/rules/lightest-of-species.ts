import type { HighlightsGenerator } from '../types';
import type { BiometricsStatsResult } from '@/app/models/db';
import {
	printProminenceQualifier,
	printValue,
	sentenceCase,
	sentenceJoin,
	printTemporalUnit,
	printTimeQualifier
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const lightestOfSpecies: HighlightsGenerator = {
	statsSelector: 'biometricsStatsBySpecies',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preambles = combinedHighlight.scopes.map(
				(scope, i) =>
					`${printProminenceQualifier(scope.ranking)} lightest${i === 0 ? ` ${combinedHighlight.species}` : ''} ${printTimeQualifier(scope.scope.parentTimeWindow, 'of')}`
			);
			return sentenceCase(
				`${sentenceJoin(preambles)}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Lightest ${printTemporalUnit(highlightsOfType.scope.temporalUnit)} count${highlightsOfType.values.length > 1 ? 's' : ''} for a single species`
	},
	descriptor: {
		type: 'lightestOfSpecies',
		unit: 'g',
		category: 'biometrics',
		smallestWins: true
	},
	generator: getTopByProperty<BiometricsStatsResult>('min_weight', {
		threshold: 3,
		smallestWins: true
	})
};
