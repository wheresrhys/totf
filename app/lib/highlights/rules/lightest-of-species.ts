import type { HighlightsGenerator } from '../types';
import type { BiometricsStatsResult } from '@/app/models/db';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const lightestOfSpecies: HighlightsGenerator = {
	statsSelector: 'biometricsStatsBySpecies',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				lineItem: ({ scope, ranking, index, combinedHighlight }) =>
					`${printProminenceQualifier(ranking)} lightest${index === 0 ? ` ${combinedHighlight.species}` : ''} ${printTimeQualifier(scope.parentTimeWindow, { yearConnector: 'of' })}`,
				shouldPrintValue: true
			}),
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
