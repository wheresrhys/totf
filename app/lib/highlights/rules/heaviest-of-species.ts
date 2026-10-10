import type { HighlightsGenerator } from '../types';
import type { BiometricsStatsResult } from '@/app/models/db';
import {
	printProminenceQualifier,
	printTimeQualifier,
	printCombinedHighlight,
	pluraliseSpecies,
	type TimeQualifierOptions
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';
const timeQualifierOptions: TimeQualifierOptions = {
	yearConnector: 'of'
};
export const heaviestOfSpecies: HighlightsGenerator = {
	statsSelector: 'biometricsStatsBySpecies',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking, combinedHighlight }) =>
					`${printProminenceQualifier(ranking)} heaviest ${combinedHighlight.species} ${printTimeQualifier(scope.parentTimeWindow, timeQualifierOptions)}`,
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking)} heaviest ${printTimeQualifier(scope.parentTimeWindow, timeQualifierOptions)}`,
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Heaviest ${highlightsOfType.values.length > 1 ? pluraliseSpecies(highlightsOfType.values[0].species as string) : highlightsOfType.values[0].species}`
	},
	descriptor: {
		type: 'heaviestOfSpecies',
		unit: 'g',
		category: 'biometrics'
	},
	generator: (rows) => {
		const results = getTopByProperty<BiometricsStatsResult>('max_weight', {
			threshold: 3
		})(rows);
		// avoid generating highlights when there are actually very few birds to build a reasonable data set
		return results.length >= 10 ? results : [];
	},
	condition: (scope) => scope.temporalUnit === 'day',
	rpcName: 'biometrics_stats',
	speciesUsed: 'grouped',
	presence: {
		species: null,
		general: {
			day: {
				perDay: {
					relativeToAllTime: 3,
					relativeToYear: 1
				}
			},
			month: null,
			year: null,
			allTimeMonth: null,
			allTime: null
		}
	}
};
