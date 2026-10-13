import type { HighlightsGenerator } from '../types';
import {
	printProminenceQualifier,
	printTemporalUnit,
	printTimeQualifier,
	printFullMonthName,
	printCombinedHighlight
} from '../lib/printer-utils';
import { getTopByProperty } from '../lib/rule-utils';

export const birdCount: HighlightsGenerator = {
	statsSelector: 'coreStats',
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				firstLineItem: ({ scope, ranking }) => {
					let result = `${printProminenceQualifier(ranking)} busiest `;

					if (scope.parentTimeWindow?.month) {
						result += `${printFullMonthName(scope.parentTimeWindow?.month)} ${printTemporalUnit(scope.temporalUnit)} ever`;
					} else {
						result += `${printTemporalUnit(scope.temporalUnit)} ${printTimeQualifier(scope.parentTimeWindow)}`;
					}
					return result;
				},
				lineItem: ({ scope, ranking }) =>
					`${printProminenceQualifier(ranking)} busiest ${printTimeQualifier(scope.parentTimeWindow)}`,
				shouldPrintValue: true
			}),
	},
	descriptor: {
		type: 'birds',
		unit: 'bird',
		category: 'count'
	},
	generator: getTopByProperty('bird_count'),
	rpcName: 'core_stats',
	speciesUsed: 'none',
	presence: {
		species: null,
		general: {
			day: {
				inter: [
					{
						sample: 'day',
						lakes: {
							allTime: 3,
							allTimeMonth: 3,
							year: 3
						}
					}
				]
			},
			allTime: {
				intra: [
					{
						sample: 'year',
						lakes: {
							allTime: 1
						}
					},
					{
						sample: 'month',
						lakes: {
							allTime: 3
						}
					},
					{
						sample: 'day',
						lakes: {
							allTime: 3
						}
					}
				]
			},
			year: {
				inter: [
					{
						sample: 'year',
						lakes: {
							allTime: 3
						}
					},
					{
						sample: 'month',
						lakes: {
							allTime: 3
						}
					},
					{
						sample: 'day',
						lakes: {
							allTime: 3
						}
					}
				],
				intra: [
					{
						sample: 'day',
						lakes: {
							year: 3
						}
					}
				]
			},
			allTimeMonth: {
				intra: [
					{
						sample: 'day',
						lakes: {
							allTimeMonth: 3
						}
					},
					{
						sample: 'month',
						lakes: {
							allTimeMonth: 3
						}
					}
				],
				inter: []
			},
			month: {
				intra: [
					{
						sample: 'day',
						lakes: {
							month: 3
						}
					}
				],
				inter: [
					{
						sample: 'month',
						lakes: {
							allTimeMonth: 3
						}
					},
					{
						sample: 'month',
						lakes: {
							allTime: 3
						}
					},
					{
						sample: 'day',
						lakes: {
							allTimeMonth: 3
						}
					},
					{
						sample: 'day',
						lakes: {
							year: 3
						}
					},
					{
						sample: 'day',
						lakes: {
							allTime: 3
						}
					}
				]
			}
		}
	}
};
