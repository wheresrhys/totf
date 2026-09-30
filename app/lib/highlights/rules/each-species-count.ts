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
import { getTopByProperty } from '../lib/rule-utils';

export const eachSpeciesCount: HighlightsGenerator = {
	statsSelector: 'coreStatsBySpecies',
	// Highest Long- tailed Tit count of 2020, and highest ever: 5 birds
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const preValue = printCombinedHighlight(combinedHighlight, {
				lineItem: ({ scope, ranking, index, combinedHighlight }) => {
					let result = `${printProminenceQualifier(ranking, 'equal')} highest `;
					if (index === 0) {
						result += `${combinedHighlight.species} count `;
						if (scope.temporalUnit !== 'day') {
							result += ` in a ${printTemporalUnit(scope.temporalUnit)}`;
						}
					}
					result += printTimeQualifier(scope.parentTimeWindow);
					return result;
				}
			});
			return sentenceCase(
				`${preValue}: ${printValue(combinedHighlight.value, combinedHighlight.descriptor)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Highest ${highlightsOfType.scope.species} count in a ${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)}`
	},

	descriptor: {
		type: 'eachSpeciesCount',
		unit: 'bird',
		category: 'count'
	},
	generator: getTopByProperty('bird_count', { threshold: 2 }),
	condition: (scope) => !scope.parentTimeWindow?.month
};
