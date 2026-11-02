import type {
	HighlightsGenerator,
	HighlightScope,
	HighlightValue
} from '../types';
import type { StatsResult } from '@/modules/stats/browser';
import {
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
function getAppearances(stats: StatsResult[]): StatsResult[] {
	return stats
		.filter((row) => row.encounter_count > 0)
		.sort((a, b) => String(a.time_period).localeCompare(String(b.time_period)));
}

export const rarities: HighlightsGenerator = {
	formatters: {
		// Only scopes[0] (the broadest) is ever read — see modules/highlights/CLAUDE.md.
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				onlyBroadestScope: true,
				lineItem: ({ scope, combinedHighlight }) =>
					`${combinedHighlight.value.value} ${combinedHighlight.species} ${printTimeQualifier(scope.parentTimeWindow)}`,
				shouldPrintValue: false
			})
	},
	descriptor: {
		type: 'rarities',
		// The carried value is only ever read for the species-name singular/plural switch — see modules/highlights/CLAUDE.md.
		unit: 'encounter',
		category: 'rarity'
	},
	generator: (
		stats: StatsResult[],
		scope?: HighlightScope
	): Omit<HighlightValue, 'descriptor'>[] => {
		const appearances = getAppearances(stats);
		const isAllTime = !Boolean(scope?.parentTimeWindow);
		const rarityAppearancesThreshold = isAllTime ? 5 : 2;
		if (!appearances.length) return [];
		const totalEncounters = appearances.reduce(
			(total, { encounter_count }) => total + encounter_count,
			0
		);

		if (appearances.length === 1) {
			return [
				{
					timePeriod: appearances[0].time_period,
					value: 'Only',
					species: appearances[0].species_name
				}
			];
		}

		if (totalEncounters <= rarityAppearancesThreshold) {
			return appearances.map((appearance, i) => ({
				timePeriod: appearance.time_period,
				value:
					i === 0
						? `first of only ${totalEncounters}`
						: `${appearance.encounter_count} of only ${totalEncounters}`,
				species: appearance.species_name
			}));
		}
		return [];
	},
	// A month-only window has no coherent reading as a first record — see modules/highlights/CLAUDE.md.
	condition: (scope) => !scope.parentTimeWindow?.month,
	speciesUsed: 'grouped',
	presence: {
		species: null,
		general: {
			day: {
				inter: [
					{
						sample: 'day',
						lakes: {
							allTime: 1,
							year: 1
						}
					}
				]
			},
			month: null,
			year: null,
			monthSquashed: null,
			allTime: null
		}
	}
};
