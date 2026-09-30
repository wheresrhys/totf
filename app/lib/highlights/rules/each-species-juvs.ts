import type { HighlightsGenerator, YearMonthRestriction } from '../types';
import type { TemporalUnit } from '@/app/components/shared/StatOutput';
import {
	printProminenceQualifier,
	printValue,
	sentenceCase,
	printTemporalUnit,
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByPropertiesSum } from '../lib/rule-utils';

export const eachSpeciesJuvs: HighlightsGenerator = {
	statsSelector: 'coreStatsBySpecies',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				lineItem: ({ scope, ranking, index, combinedHighlight }) => {
					let result = `${printProminenceQualifier(ranking, 'equal')} highest `;
					if (index === 0) {
						result += `juv ${combinedHighlight.species} count `;
						if (scope.temporalUnit !== 'day') {
							result += ` in a ${printTemporalUnit(scope.temporalUnit)}`;
						}
					}
					result += printTimeQualifier(scope.parentTimeWindow);
					return result;
				},
				shouldPrintValue: true
			}),
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Highest juv ${highlightsOfType.scope.species} count in a ${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)}`
	},
	descriptor: {
		type: 'eachSpeciesJuvs',
		unit: 'bird',
		category: 'demographics'
	},
	generator: getTopByPropertiesSum(['pullus_bird_count', 'juv_bird_count'], {
		threshold: 3
	}),
	limit: 1,
	condition: (scope) => !scope.parentTimeWindow?.month
};
