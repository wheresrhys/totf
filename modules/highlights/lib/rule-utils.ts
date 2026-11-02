import type { HighlightValue } from '../types';
import { DEFAULT_THRESHOLD } from '../const';
import type { StatsResult } from '@/modules/stats/browser';
type HighlightFinderOptions = {
	threshold?: number;
	// Rarity finders only: the most periods a species can have ever appeared in
	// and still count as rare.
	maxAppearances?: number;
	// Rarity finders only: drop an appearance in the working set's earliest period — see modules/highlights/CLAUDE.md.
	suppressInEarliestPeriod?: boolean;
	smallestWins?: boolean;
};

function sumProperties(item: StatsResult, properties: (keyof StatsResult)[]) {
	return properties.reduce(
		(sum, property) => sum + ((item[property] as number) ?? 0),
		0
	);
}

export function getTopByPropertiesSum(
	properties: (keyof StatsResult)[],
	options?: HighlightFinderOptions
): (stats: StatsResult[]) => HighlightValue[] {
	// Floor below which a finder's top value isn't distinctive enough to highlight — see modules/highlights/CLAUDE.md.
	const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
	return (stats: StatsResult[]) => {
		const potentialHighlights = stats.map((row) => ({
			timePeriod: row.time_period as string,
			value: sumProperties(row, properties),
			species: row.species_name
		}));
		const max = Math.max(...potentialHighlights.map((item) => item.value));
		return potentialHighlights
			.filter((row) => row.value >= Math.max(threshold, max / 2))
			.sort((a, b) =>
				options?.smallestWins ? a.value - b.value : b.value - a.value
			);
	};
}

export function getTopByProperty(
	property: keyof StatsResult,
	options?: HighlightFinderOptions
): (stats: StatsResult[]) => HighlightValue[] {
	return getTopByPropertiesSum([property], options);
}
