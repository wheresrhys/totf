import { describe, it, expect } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import {
	SESSION_DATE,
	PAST_PERIOD_TODAY,
	PRIOR_AUTUMN_OTHER_YEAR,
	PRIOR_SUMMER_OTHER_YEAR,
	PRIOR_SUMMER_THIS_YEAR,
	PRIOR_THIS_SEASON,
	PRIOR_SUMMER_YEAR_ONE,
	PRIOR_SUMMER_YEAR_ONE_LATER,
	PRIOR_SUMMER_YEAR_THREE,
	LATER_DAY,
	LATER_DAY_TWO,
	LATER_DAY_THREE,
	speciesRow,
	statsFor
} from '@/app/models/highlights/__tests__/fixtures';
import { deriveSpeciesRecords } from '../derive-species-count';

const REED_WARBLER = 'Reed Warbler';
const ROBIN = 'Robin';

function deriveSpecies(
	results: StatsPerDayAndSpeciesResult[],
	today = PAST_PERIOD_TODAY
) {
	return deriveSpeciesRecords({
		date: SESSION_DATE,
		stats: statsFor(results),
		today
	});
}

describe('deriveSpeciesRecords', () => {
	it('reports the broadest scope achieved per species', () => {
		// Two prior days had 5; the session has 10, so it beats the all-time record
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, REED_WARBLER, 5),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 5)
		]);
		expect(highlights).toHaveLength(1);
		expect(highlights[0]).toMatchObject({
			type: 'species-count-record',
			speciesName: REED_WARBLER,
			scope: 'all-time',
			value: 10
		});
	});

	it('reports multiple species records from one session', () => {
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(SESSION_DATE, ROBIN, 8),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 5),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 3)
		]);
		const speciesNames = highlights.map((h) => h.speciesName);
		expect(speciesNames).toContain(REED_WARBLER);
		expect(speciesNames).toContain(ROBIN);
	});

	it('requires the species to appear on another day in scope', () => {
		// Reed Warbler only appears on the session day — no other day, no record
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 3)
		]);
		expect(highlights.map((h) => h.speciesName)).not.toContain(REED_WARBLER);
	});

	it('demotes the session to a placement when a later day has a higher count', () => {
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 5),
			speciesRow(LATER_DAY, REED_WARBLER, 100)
		]);
		expect(highlights).toHaveLength(1);
		expect(highlights[0]).toMatchObject({
			speciesName: REED_WARBLER,
			scope: 'all-time',
			value: 10,
			placementRank: 2,
			isJointPlacement: false
		});
	});

	it('reports a joint best day when only a later day ties the session count', () => {
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(LATER_DAY, REED_WARBLER, 10)
		]);
		expect(highlights).toHaveLength(1);
		expect(highlights[0]).toMatchObject({
			speciesName: REED_WARBLER,
			scope: 'all-time',
			value: 10,
			placementRank: 1,
			isJointPlacement: true
		});
	});

	it('keeps the for-N-years copy for an old prior tie even when a later day also ties', () => {
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, REED_WARBLER, 10),
			speciesRow(LATER_DAY, REED_WARBLER, 10)
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				speciesName: REED_WARBLER,
				scope: 'all-time',
				value: 10,
				recordEqualledYearsAgo: 3
			})
		);
	});

	it('reports an all-time tie older than a year as a for-N-years record', () => {
		// Prior date is >1 year before SESSION_DATE (2024-09-15)
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, REED_WARBLER, 10) // 2021-09-10 — 3 years ago
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				speciesName: REED_WARBLER,
				scope: 'all-time',
				value: 10,
				recordEqualledYearsAgo: 3
			})
		);
	});

	it('reports an all-time tie under a year old as a joint best day', () => {
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_SUMMER_THIS_YEAR, REED_WARBLER, 10) // 2024-05-01 — < 1 year
		]);
		expect(highlights).toHaveLength(1);
		expect(highlights[0]).toMatchObject({
			speciesName: REED_WARBLER,
			scope: 'all-time',
			value: 10,
			placementRank: 1,
			isJointPlacement: true
		});
	});

	it('ignores a this-year tie', () => {
		// all-time placements blocked by three days at the top value; this year
		// merely ties the session — a tie is not reportable in this-year
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 20),
			speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 20),
			speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 20),
			speciesRow(PRIOR_THIS_SEASON, REED_WARBLER, 10) // this-year tie (2024)
		]);
		expect(highlights).toHaveLength(0);
	});

	it('never reports a species highlight when the session count is 1', () => {
		// would otherwise be a record-equalling day
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 1),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, REED_WARBLER, 1)
		]);
		expect(highlights).toHaveLength(0);
	});

	it('sets the current-year flag from the injected today', () => {
		// today during the session year: isCurrentYear true
		const highlights = deriveSpecies(
			[
				speciesRow(SESSION_DATE, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 5)
			],
			new Date('2024-10-20')
		);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				speciesName: REED_WARBLER,
				isCurrentYear: true
			})
		);
	});

	describe('all-time 2nd/3rd placements', () => {
		it('reports a strict 2nd-best day when the session count falls between the two best prior values', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 5)
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({
				type: 'species-count-record',
				speciesName: REED_WARBLER,
				scope: 'all-time',
				value: 8,
				placementRank: 2,
				isJointPlacement: false
			});
		});

		it('reports a strict 3rd-best day when the session count falls between the 2nd and 3rd prior values', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 5),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 3)
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({
				placementRank: 3,
				isJointPlacement: false
			});
		});

		it('reports a joint 2nd-best day with no age gate when the session ties a recent 2nd-best value', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_THIS_SEASON, REED_WARBLER, 8) // < 1 month old
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({
				scope: 'all-time',
				placementRank: 2,
				isJointPlacement: true
			});
		});

		it('does not report a joint 3rd-best day when the session ties the 3rd-best value', () => {
			// A joint 3rd merely repeats an already-lesser record — suppressed
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 5),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 5)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('reports a joint 2nd-best day even when many other days share the tied value', () => {
			// Ties for 2nd stay notable however many days hold the value — only
			// the top value's day count gates whether 2nd place is reported
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 8),
				speciesRow(PRIOR_THIS_SEASON, REED_WARBLER, 8)
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({
				scope: 'all-time',
				placementRank: 2,
				isJointPlacement: true
			});
		});

		it('reports both an all-time placement and a narrower-scope record for the same species', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_THIS_SEASON, REED_WARBLER, 3)
			]);
			expect(highlights).toHaveLength(2);
			expect(highlights).toContainEqual(
				expect.objectContaining({
					scope: 'all-time',
					placementRank: 2,
					isJointPlacement: false
				})
			);
			expect(highlights).toContainEqual(
				expect.objectContaining({ scope: 'this-year', value: 8 })
			);
		});

		it('does not report placements in narrower scopes', () => {
			// three top days block all-time tiers; session beats this year's
			// best but a this-year 2nd place is not a thing
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 20),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 20),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 20),
				speciesRow(PRIOR_SUMMER_THIS_YEAR, REED_WARBLER, 10)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('continues to narrower scopes when the session misses every included placement tier', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 20),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 15),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 12),
				speciesRow(PRIOR_THIS_SEASON, REED_WARBLER, 5)
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({ scope: 'this-year', value: 8 });
			expect(highlights[0].placementRank).toBeUndefined();
		});

		it('counts later days when building placement tiers', () => {
			// three later days at the top value block 2nd place
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(LATER_DAY, REED_WARBLER, 10),
				speciesRow(LATER_DAY_TWO, REED_WARBLER, 10),
				speciesRow(LATER_DAY_THREE, REED_WARBLER, 10)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('does not report 2nd place when three prior days share the top value', () => {
			// session would be rank 4
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE_LATER, REED_WARBLER, 5)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('does not report 3rd place when the top two tiers already cover three prior days', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 5),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_YEAR_ONE_LATER, REED_WARBLER, 4)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('suppresses a joint 3rd when tying the 2nd value behind two joint-top days', () => {
			// Two joint-top days rank the session 3rd, and it ties another day at
			// that value — a joint 3rd, so it is suppressed
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 8)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('reports no placement when the session falls below all existing tier values', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 5),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 8)
			]);
			expect(highlights).toHaveLength(0);
		});
	});
});
