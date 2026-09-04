import { describe, it, expect } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import {
	SESSION_DATE,
	PAST_PERIOD_TODAY,
	PRIOR_AUTUMN_OTHER_YEAR,
	PRIOR_SUMMER_OTHER_YEAR,
	PRIOR_SUMMER_THIS_YEAR,
	LATER_DAY,
	LATER_DAY_TWO,
	statsFor
} from '@/app/models/highlights/__tests__/fixtures';
import { deriveWeightRecordBreakers } from '../derive-weight-record';

const BLUE_TIT = 'Blue Tit';

function weightRow(
	date: string,
	species: string,
	{
		weighedBirds = 1,
		minWeight,
		maxWeight
	}: { weighedBirds?: number; minWeight: number; maxWeight: number }
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

function deriveWeights(
	results: StatsPerDayAndSpeciesResult[],
	today = PAST_PERIOD_TODAY
) {
	return deriveWeightRecordBreakers({
		date: SESSION_DATE,
		stats: statsFor(results),
		today
	});
}

describe('deriveWeightRecordBreakers', () => {
	it('ranks the heaviest bird 1st when its max beats every other day', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 13.0
			})
		]);
		expect(highlights).toContainEqual({
			type: 'weight-record',
			speciesName: BLUE_TIT,
			scope: 'all-time',
			extreme: 'heaviest',
			weight: 13.1,
			placementRank: 1,
			isJointPlacement: false,
			year: 2024,
			isCurrentYear: false
		});
	});

	it('ranks the lightest bird 1st when its min beats every other day', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 9.8, maxWeight: 12 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.2,
				maxWeight: 13.0
			})
		]);
		expect(highlights).toContainEqual({
			type: 'weight-record',
			speciesName: BLUE_TIT,
			scope: 'all-time',
			extreme: 'lightest',
			weight: 9.8,
			placementRank: 1,
			isJointPlacement: false,
			year: 2024,
			isCurrentYear: false
		});
	});

	it('reports a 2nd-heaviest placement when one other day is heavier', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 12.5
			}),
			weightRow(LATER_DAY, BLUE_TIT, { minWeight: 10.9, maxWeight: 14.0 })
		]);
		expect(highlights).toContainEqual({
			type: 'weight-record',
			speciesName: BLUE_TIT,
			scope: 'all-time',
			extreme: 'heaviest',
			weight: 13.1,
			placementRank: 2,
			isJointPlacement: false,
			year: 2024,
			isCurrentYear: false
		});
	});

	it('reports a 3rd-heaviest placement when two other days are heavier', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 14.0
			}),
			weightRow(LATER_DAY, BLUE_TIT, { minWeight: 10.9, maxWeight: 13.5 })
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				extreme: 'heaviest',
				weight: 13.1,
				placementRank: 3,
				isJointPlacement: false
			})
		);
	});

	it('does not report a placement beyond the top 3', () => {
		// three other days are heavier, so the session ranks 4th
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 14.0
			}),
			weightRow(LATER_DAY, BLUE_TIT, { minWeight: 10.9, maxWeight: 13.8 }),
			weightRow(LATER_DAY_TWO, BLUE_TIT, { minWeight: 10.8, maxWeight: 13.5 })
		]);
		expect(highlights.map((h) => h.extreme)).not.toContain('heaviest');
	});

	it('flags a joint placement when another day matches the extreme exactly', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_AUTUMN_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 13.1
			})
		]);
		expect(highlights).toContainEqual({
			type: 'weight-record',
			speciesName: BLUE_TIT,
			scope: 'all-time',
			extreme: 'heaviest',
			weight: 13.1,
			placementRank: 1,
			isJointPlacement: true,
			year: 2024,
			isCurrentYear: false
		});
	});

	it('suppresses a joint 3rd placement when two days are heavier and another ties', () => {
		// Two heavier days rank the session 3rd, and a fourth day matches its
		// weight — a joint 3rd, which repeats a lesser record and is suppressed
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 14.0
			}),
			weightRow(LATER_DAY, BLUE_TIT, { minWeight: 10.9, maxWeight: 13.8 }),
			weightRow(LATER_DAY_TWO, BLUE_TIT, { minWeight: 10.8, maxWeight: 13.1 })
		]);
		expect(highlights.map((highlight) => highlight.extreme)).not.toContain(
			'heaviest'
		);
	});

	it('counts later days when ranking placements', () => {
		// the later day is heavier, demoting the session to 2nd
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 12.0
			}),
			weightRow(LATER_DAY, BLUE_TIT, { minWeight: 11.5, maxWeight: 13.5 })
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({ extreme: 'heaviest', placementRank: 2 })
		);
	});

	it('requires at least 3 weighed encounters on other days', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 2,
				minWeight: 10.5,
				maxWeight: 13.0
			})
		]);
		expect(highlights).toEqual([]);
	});

	it('ignores species with no weighed encounter in the session', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, {
				weighedBirds: 0,
				minWeight: 0,
				maxWeight: 0
			}),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 13.0
			})
		]);
		expect(highlights).toEqual([]);
	});

	describe('this-year scope', () => {
		it('reports a this-year heaviest 1st once the year clears the weighed threshold', () => {
			// Three weighed birds this year (across other days), and the session's
			// max beats them — heaviest of the year
			const highlights = deriveWeights([
				weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
				weightRow(PRIOR_SUMMER_THIS_YEAR, BLUE_TIT, {
					weighedBirds: 3,
					minWeight: 10.5,
					maxWeight: 12.5
				})
			]);
			expect(highlights).toContainEqual({
				type: 'weight-record',
				speciesName: BLUE_TIT,
				scope: 'this-year',
				extreme: 'heaviest',
				weight: 13.1,
				placementRank: 1,
				isJointPlacement: false,
				year: 2024,
				isCurrentYear: false
			});
		});

		it('reports a this-year lightest 1st when the session min beats every day this year', () => {
			const highlights = deriveWeights([
				weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 9.8, maxWeight: 12 }),
				weightRow(PRIOR_SUMMER_THIS_YEAR, BLUE_TIT, {
					weighedBirds: 3,
					minWeight: 10.2,
					maxWeight: 13.0
				})
			]);
			expect(highlights).toContainEqual(
				expect.objectContaining({
					scope: 'this-year',
					extreme: 'lightest',
					weight: 9.8,
					placementRank: 1
				})
			);
		});

		it('does not report a this-year 2nd/3rd placement — only a first place', () => {
			// A prior day this year is heavier, so the session is only 2nd heaviest
			// of the year; the this-year scope reports only first places
			const highlights = deriveWeights([
				weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
				weightRow(PRIOR_SUMMER_THIS_YEAR, BLUE_TIT, {
					weighedBirds: 3,
					minWeight: 10.5,
					maxWeight: 14.0
				})
			]);
			expect(
				highlights.filter((highlight) => highlight.scope === 'this-year')
			).toEqual([]);
		});

		it('suppresses this-year highlights until the year clears the weighed threshold', () => {
			// Only two weighed birds this year (across other days) — below the
			// threshold — so no this-year highlight even though the session leads
			const highlights = deriveWeights([
				weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
				weightRow(PRIOR_SUMMER_THIS_YEAR, BLUE_TIT, {
					weighedBirds: 2,
					minWeight: 10.5,
					maxWeight: 12.5
				})
			]);
			expect(
				highlights.filter((highlight) => highlight.scope === 'this-year')
			).toEqual([]);
		});

		it('flags a joint this-year 1st when another day this year matches the extreme', () => {
			const highlights = deriveWeights([
				weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
				weightRow(PRIOR_SUMMER_THIS_YEAR, BLUE_TIT, {
					weighedBirds: 3,
					minWeight: 10.5,
					maxWeight: 13.1
				})
			]);
			expect(highlights).toContainEqual(
				expect.objectContaining({
					scope: 'this-year',
					extreme: 'heaviest',
					weight: 13.1,
					placementRank: 1,
					isJointPlacement: true
				})
			);
		});

		it('produces both all-time and this-year highlights when the session leads both', () => {
			// Every comparison day is this year, so the session's heaviest leads
			// both scopes — derivation yields both (the group's combine rule later
			// reconciles them)
			const scopes = deriveWeights([
				weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
				weightRow(PRIOR_SUMMER_THIS_YEAR, BLUE_TIT, {
					weighedBirds: 3,
					minWeight: 10.5,
					maxWeight: 12.5
				})
			])
				.filter((highlight) => highlight.extreme === 'heaviest')
				.map((highlight) => highlight.scope);
			expect(scopes).toEqual(['all-time', 'this-year']);
		});
	});
});
