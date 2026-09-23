import type { HighlightValue } from '../types';
import type { CoreStatsResult } from '@/app/models/db';
export const DEFAULT_OPTIONS = { limit: 3, threshold: 2 };

type HighlightFinderOptions = {
	threshold?: number;
};

function sumProperties(
	item: CoreStatsResult,
	properties: (keyof CoreStatsResult)[]
) {
	return properties.reduce(
		(sum, property) => sum + ((item[property] as number) ?? 0),
		0
	);
}

export function getTopByPropertiesSum(
	properties: (keyof CoreStatsResult)[],
	options?: HighlightFinderOptions
): (stats: CoreStatsResult[]) => HighlightValue[] {
	const { threshold } = {
		...DEFAULT_OPTIONS,
		...(options || {})
	};
	return (stats: CoreStatsResult[]) => {
		const potentialHighlights = stats.map((row) => ({
			timePeriod: row.time_period as string,
			value: sumProperties(row, properties),
			species: row.species_name
		}));
		const max = Math.max(...potentialHighlights.map((item) => item.value));
		return potentialHighlights
			.filter((row) => row.value >= Math.max(threshold, max / 2))
			.sort((a, b) => b.value - a.value);
	};
}

export function getTopByProperty(
	property: keyof CoreStatsResult,
	options?: HighlightFinderOptions
): (stats: CoreStatsResult[]) => HighlightValue[] {
	return getTopByPropertiesSum([property], options);
}
