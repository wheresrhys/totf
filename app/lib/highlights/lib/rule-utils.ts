import type { HighlightValue } from '../types';
import { DEFAULT_THRESHOLD } from '../const';

type HighlightFinderOptions = {
	threshold?: number;
	// Rarity finders only: the most periods a species can have ever appeared in
	// and still count as rare.
	maxAppearances?: number;
	// Rarity finders only: drop an appearance that falls in the earliest period
	// of the working set — on the group's very first session (or first month, or
	// first year) every species is trivially a first record, which says more
	// about the start of the data than about the birds.
	suppressInEarliestPeriod?: boolean;
	smallestWins?: boolean;
};

type RowWithIdentity = {
	time_period: string | null;
	species_name: string | null;
};

function sumProperties<Row extends RowWithIdentity>(
	item: Row,
	properties: (keyof Row)[]
) {
	return properties.reduce(
		(sum, property) => sum + ((item[property] as number) ?? 0),
		0
	);
}

export function getTopByPropertiesSum<Row extends RowWithIdentity>(
	properties: (keyof Row)[],
	options?: HighlightFinderOptions
): (stats: Row[]) => HighlightValue[] {
	const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
	return (stats: Row[]) => {
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

export function getTopByProperty<Row extends RowWithIdentity>(
	property: keyof Row,
	options?: HighlightFinderOptions
): (stats: Row[]) => HighlightValue[] {
	return getTopByPropertiesSum<Row>([property], options);
}
