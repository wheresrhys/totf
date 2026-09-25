import type { HighlightValue } from '../types';
import type { CoreStatsResult } from '@/app/models/db';
import { DEFAULT_THRESHOLD, DEFAULT_MAX_APPEARANCES } from '../const';

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
	const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
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

// ---- rarity finders ----
//
// The finders above rank a metric and take the top of it. Rarity is a different
// shape: it asks *whether a species was present at all* in a period, and then
// how that presence sits in the sequence of every period the species has ever
// been present in. So these read a row as a boolean ("was this species in the
// hand here?") rather than as a number, and they select by position in that
// sequence rather than by magnitude.
//
// They only ever make sense over a per-species working set
// (`statsSelector: (stats) => stats.bySpecies`): the sequence they walk is one
// species' own history, not a leaderboard across species.

// core_stats returns a row for every (species, period) cell in range whether or
// not anything was caught in it — stats_spine CROSS JOINs the species spine
// against the period spine and core_stats LEFT JOINs its aggregates onto that,
// COALESCEing every count to 0. So a row existing proves only that the period
// exists, never that the species was present in it; presence has to be tested.
// That cuts both ways, and both are load-bearing below: the absence rows are
// what let a single species' working set stand in for the full list of periods
// the group has data for.
function getAppearances(stats: CoreStatsResult[]): CoreStatsResult[] {
	return stats
		.filter((row) => row.encounter_count > 0)
		.sort((a, b) => String(a.time_period).localeCompare(String(b.time_period)));
}

// A period is the earliest in the working set when no period in it sorts before
// the period given. Under an all-time scope that makes the group's first period
// of data; under a year-scoped window, the first period of that year.
function isEarliestPeriod(
	stats: CoreStatsResult[],
	row: CoreStatsResult
): boolean {
	return !stats.some(
		(candidate) => String(candidate.time_period) < String(row.time_period)
	);
}

// The value carried is the cell's own encounter count, which is what a printer
// needs to choose between "record" and "records".
function toAppearanceHighlight(
	row: CoreStatsResult,
	value: number = row.encounter_count
): HighlightValue {
	return {
		timePeriod: row.time_period as string,
		value,
		species: row.species_name
	};
}

// The species' earliest appearance, for a species that has appeared more than
// once. Under an all-time scope that's its first record ever; under a
// year-scoped window, its first record of that year — the same fact read
// through a narrower window, which is exactly what makes the generic
// scope-combining machinery collapse the two into one line.
//
// Appearing in exactly one period is deliberately left to getSoleAppearance
// below: keeping the two mutually exclusive is what stops a one-off species
// printing both a "first" and an "only" line for the same cell.
export function getFirstAppearance(
	options?: HighlightFinderOptions
): (stats: CoreStatsResult[]) => HighlightValue[] {
	return (stats: CoreStatsResult[]) => {
		const appearances = getAppearances(stats);
		if (appearances.length < 2) return [];
		const [firstAppearance] = appearances;
		if (
			options?.suppressInEarliestPeriod &&
			isEarliestPeriod(stats, firstAppearance)
		) {
			return [];
		}
		return [toAppearanceHighlight(firstAppearance)];
	};
}

// The single period a species has ever appeared in — its only record ever under
// an all-time scope, its only record of the year under a year-scoped window.
export function getSoleAppearance(
	options?: HighlightFinderOptions
): (stats: CoreStatsResult[]) => HighlightValue[] {
	return (stats: CoreStatsResult[]) => {
		const appearances = getAppearances(stats);
		if (appearances.length !== 1) return [];
		const [soleAppearance] = appearances;
		if (
			options?.suppressInEarliestPeriod &&
			isEarliestPeriod(stats, soleAppearance)
		) {
			return [];
		}
		return [toAppearanceHighlight(soleAppearance)];
	};
}

// Every return visit by a species the group has only ever recorded in a handful
// of periods. The value carried is that total count of periods, not the cell's
// encounter count — it's the rarity, not the haul, that the line is about.
//
// The species' first appearance is skipped: that period is the first-appearance
// finders' headline, and duplicating it here would put two rarity lines on the
// same cell.
export function getInfrequentAppearances(
	options?: HighlightFinderOptions
): (stats: CoreStatsResult[]) => HighlightValue[] {
	const maxAppearances = options?.maxAppearances ?? DEFAULT_MAX_APPEARANCES;
	return (stats: CoreStatsResult[]) => {
		const appearances = getAppearances(stats);
		if (appearances.length < 2 || appearances.length > maxAppearances)
			return [];
		return appearances
			.slice(1)
			.map((row) => toAppearanceHighlight(row, appearances.length));
	};
}
