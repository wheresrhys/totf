import { describe, it, expect } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import {
	SESSION_DATE,
	PAST_PERIOD_TODAY,
	PRIOR_SUMMER_OTHER_YEAR,
	PRIOR_SUMMER_THIS_YEAR,
	statsFor
} from '@/app/models/highlights/__tests__/fixtures';
import { runVitalStatsGroup } from '..';

function weightRow(
	date: string,
	species: string,
	minWeight: number,
	maxWeight: number,
	weighedBirds = 3
): StatsPerDayAndSpeciesResult {
	return {
		visit_date: date,
		species_name: species,
		encounter_count: weighedBirds,
		juv_count: 0,
		postjuv_count: 0,
		pullus_count: 0,
		weighed_birds_count: weighedBirds,
		min_weight: minWeight,
		max_weight: maxWeight
	};
}

describe('runVitalStatsGroup — pipeline (integration)', () => {
	it('runs derive -> combine and returns weight records for the session', () => {
		const results = [
			weightRow(SESSION_DATE, 'Blue Tit', 11, 13.1),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, 'Blue Tit', 10.5, 12.5)
		];
		const highlights = runVitalStatsGroup({
			date: SESSION_DATE,
			stats: statsFor(results),
			today: PAST_PERIOD_TODAY
		});
		// The session also holds a lightest-2nd placement (11 vs the prior day's
		// 10.5) — this test is about the heaviest fan-out, so filter to it
		expect(
			highlights.filter((highlight) => highlight.extreme === 'heaviest')
		).toEqual([
			expect.objectContaining({
				type: 'weight-record',
				speciesName: 'Blue Tit',
				scope: 'all-time',
				extreme: 'heaviest',
				weight: 13.1,
				placementRank: 1
			})
		]);
	});

	it('reconciles a this-year 1st with an all-time 2nd into a combined-weight-record', () => {
		const results = [
			weightRow(SESSION_DATE, 'Blue Tit', 11, 13.1),
			// all-time: heavier day (Blue Tit's all-time 2nd), prior year
			weightRow('2022-05-01', 'Blue Tit', 10.5, 14.0),
			// this-year: session leads the year
			weightRow(PRIOR_SUMMER_THIS_YEAR, 'Blue Tit', 10.2, 12.5)
		];
		const highlights = runVitalStatsGroup({
			date: SESSION_DATE,
			stats: statsFor(results),
			today: PAST_PERIOD_TODAY
		});
		expect(highlights).toContainEqual(
			expect.objectContaining({
				type: 'combined-weight-record',
				speciesName: 'Blue Tit',
				extreme: 'heaviest',
				allTimeRank: 2
			})
		);
	});
});
