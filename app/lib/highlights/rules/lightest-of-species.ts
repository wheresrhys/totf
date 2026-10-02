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
export const lightestOfSpecies: HighlightsGenerator = {
	statsSelector: 'biometricsStatsBySpecies',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking, combinedHighlight }) =>
					`${printProminenceQualifier(ranking)} lightest ${combinedHighlight.species} ${printTimeQualifier(scope.parentTimeWindow, timeQualifierOptions)}`,
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking)} lightest ${printTimeQualifier(scope.parentTimeWindow, timeQualifierOptions)}`,
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Lightest ${highlightsOfType.values.length > 1 ? pluraliseSpecies(highlightsOfType.values[0].species as string) : highlightsOfType.values[0].species}`
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
	}),
	condition: (scope) => scope.temporalUnit === 'day'
};
