import type {
	HighlightsGenerator,
	HighlightScope,
	HighlightValue
} from '../types';
import type { CoreStatsResult } from '@/app/models/db';
import {
	printTimeQualifier,
	printCombinedHighlight
} from '../lib/printer-utils';
function getAppearances(stats: CoreStatsResult[]): CoreStatsResult[] {
	return stats
		.filter((row) => row.encounter_count > 0)
		.sort((a, b) => String(a.time_period).localeCompare(String(b.time_period)));
}

export const rarities: HighlightsGenerator = {
	statsSelector: 'coreStatsBySpecies',
	formatters: {
		// Only scopes[0] is read. Unlike a count metric, where each extra scope
		// adds information ("busiest ever AND busiest of 2020"), every extra scope
		// on a first record merely restates the broadest one: a species' first
		// record ever is necessarily also its first of that year. scopes[0] is the
		// broadest (see sortByPositionAndTimeWindow), so it is the one to print.
		combinedHighlightPrinter: (combinedHighlight) =>
			printCombinedHighlight(combinedHighlight, {
				onlyBroadestScope: true,
				lineItem: ({ scope, combinedHighlight }) =>
					`${combinedHighlight.value.value} ${combinedHighlight.species} ${printTimeQualifier(scope.parentTimeWindow)}`,
				shouldPrintValue: false
			}),
		highlightListPrefixPrinter: () => 'Rarities'
	},
	descriptor: {
		type: 'rarities',
		// The value carried is the cell's encounter count, which only ever gets
		// read as the singular/plural switch on the species name above.
		unit: 'encounter',
		category: 'rarity'
	},
	generator: (
		stats: CoreStatsResult[],
		scope: HighlightScope | undefined
	): Omit<HighlightValue, 'descriptor'>[] => {
		const appearances = getAppearances(stats);
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

		if (totalEncounters <= 4 && !scope?.parentTimeWindow) {
			return appearances.map((appearance, i) => ({
				timePeriod: appearance.time_period,
				value:
					i === 0
						? `first of only ${totalEncounters}`
						: `${appearance.encounter_count} of only ${totalEncounters}`,
				species: appearance.species_name
			}));
		}

		return [
			{
				timePeriod: appearances[0].time_period,
				value: 'first',
				species: appearances[0].species_name
			}
		];
	},
	// A month-only window asks "of any February", which has no coherent reading
	// as a first record — the earliest February a species appeared in is not a
	// first of anything.
	condition: (scope) => !scope.parentTimeWindow?.month
};
