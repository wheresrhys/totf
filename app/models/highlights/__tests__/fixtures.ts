import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';

// Shared test fixtures for every group's derive-function tests (rarities,
// counts, vital-stats) — consolidates what were two near-identical row
// builders (dayRows/statsFor and speciesRow/statsForSpecies) in the old
// monolithic session-highlights.test.ts into one canonical set.

export const SESSION_DATE = '2024-09-15'; // autumn
// A fixed "today" after the session's year and season, so current-period
// flags are deterministically false unless a test passes its own today
export const PAST_PERIOD_TODAY = new Date('2025-06-01');

// Comparison days used across tests, chosen for their scope membership
// relative to SESSION_DATE:
export const PRIOR_AUTUMN_OTHER_YEAR = '2021-09-10'; // all-time only (3+ years ago)
export const PRIOR_SUMMER_OTHER_YEAR = '2022-05-01'; // all-time only
export const PRIOR_SUMMER_THIS_YEAR = '2024-05-01'; // this-year (and all-time)
export const PRIOR_THIS_SEASON = '2024-08-20'; // this-year (and all-time)
export const LATER_DAY = '2024-10-01'; // after the session, but in every scope
export const LATER_DAY_TWO = '2024-10-05';
export const LATER_DAY_THREE = '2024-10-20';
// Additional all-time-only days for multi-day placement-tier scenarios
export const PRIOR_SUMMER_YEAR_ONE = '2021-05-01';
export const PRIOR_SUMMER_YEAR_ONE_LATER = '2021-05-15';
export const PRIOR_SUMMER_YEAR_THREE = '2023-05-01';

export function dayRows(
	date: string,
	speciesCounts: Record<string, number>
): StatsPerDayAndSpeciesResult[] {
	return Object.entries(speciesCounts).map(
		([species_name, encounter_count]) => ({
			species_name,
			visit_date: date,
			encounter_count,
			juv_count: 0,
			postjuv_count: 0,
			pullus_count: 0,
			weighed_birds_count: 0,
			min_weight: 0,
			max_weight: 0
		})
	);
}

export function speciesRow(
	date: string,
	species: string,
	count: number
): StatsPerDayAndSpeciesResult {
	return {
		visit_date: date,
		species_name: species,
		encounter_count: count,
		juv_count: 0,
		postjuv_count: 0,
		pullus_count: 0,
		weighed_birds_count: 0,
		min_weight: 0,
		max_weight: 0
	};
}

export function statsFor(
	results: StatsPerDayAndSpeciesResult[]
): SessionStatsData {
	return {
		daySpeciesStats: results,
		sessionDates: [...new Set(results.map((row) => row.visit_date))]
	};
}
