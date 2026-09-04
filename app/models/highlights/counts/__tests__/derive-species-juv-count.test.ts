import { describe, it, expect } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import {
	SESSION_DATE,
	PAST_PERIOD_TODAY,
	PRIOR_AUTUMN_OTHER_YEAR,
	PRIOR_SUMMER_OTHER_YEAR,
	PRIOR_SUMMER_THIS_YEAR,
	LATER_DAY,
	statsFor
} from '@/app/models/highlights/__tests__/fixtures';
import { juvRow } from './juv-fixtures';
import { deriveSpeciesJuvRecords } from '../derive-species-juv-count';

const ROBIN = 'Robin';
const REED_WARBLER = 'Reed Warbler';

function deriveSpeciesJuvs(
	results: StatsPerDayAndSpeciesResult[],
	today = PAST_PERIOD_TODAY
) {
	return deriveSpeciesJuvRecords({
		date: SESSION_DATE,
		stats: statsFor(results),
		today
	});
}

describe('deriveSpeciesJuvRecords', () => {
	it('reports the broadest scope achieved per species', () => {
		const highlights = deriveSpeciesJuvs([
			juvRow(SESSION_DATE, REED_WARBLER, 10),
			juvRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 5)
		]);
		expect(highlights).toHaveLength(1);
		expect(highlights[0]).toMatchObject({
			type: 'species-juv-count-record',
			speciesName: REED_WARBLER,
			scope: 'all-time',
			value: 10
		});
	});

	it('only produces a highlight when the juv count is greater than 4', () => {
		// A session juv count of exactly 4 is below the threshold
		const atThreshold = deriveSpeciesJuvs([
			juvRow(SESSION_DATE, REED_WARBLER, 4),
			juvRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 2)
		]);
		expect(atThreshold).toHaveLength(0);
		// 5 clears it
		const aboveThreshold = deriveSpeciesJuvs([
			juvRow(SESSION_DATE, REED_WARBLER, 5),
			juvRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 2)
		]);
		expect(aboveThreshold).toHaveLength(1);
	});

	it('requires the species to appear on another day in scope', () => {
		const highlights = deriveSpeciesJuvs([
			juvRow(SESSION_DATE, REED_WARBLER, 10),
			juvRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 8)
		]);
		expect(highlights.map((h) => h.speciesName)).not.toContain(REED_WARBLER);
	});

	it('demotes the session to a placement when a later day has a higher juv count', () => {
		const highlights = deriveSpeciesJuvs([
			juvRow(SESSION_DATE, REED_WARBLER, 10),
			juvRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 5),
			juvRow(LATER_DAY, REED_WARBLER, 100)
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

	it('reports an all-time tie older than a year as a for-N-years record', () => {
		const highlights = deriveSpeciesJuvs([
			juvRow(SESSION_DATE, REED_WARBLER, 10),
			juvRow(PRIOR_AUTUMN_OTHER_YEAR, REED_WARBLER, 10) // 3 years ago
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
		const highlights = deriveSpeciesJuvs([
			juvRow(SESSION_DATE, REED_WARBLER, 10),
			juvRow(PRIOR_SUMMER_THIS_YEAR, REED_WARBLER, 10) // < 1 year
		]);
		expect(highlights).toHaveLength(1);
		expect(highlights[0]).toMatchObject({
			placementRank: 1,
			isJointPlacement: true
		});
	});

	it('reports multiple species juv records from one session', () => {
		const highlights = deriveSpeciesJuvs([
			juvRow(SESSION_DATE, REED_WARBLER, 10),
			juvRow(SESSION_DATE, ROBIN, 8),
			juvRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 5),
			juvRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 3)
		]);
		const speciesNames = highlights.map((h) => h.speciesName);
		expect(speciesNames).toContain(REED_WARBLER);
		expect(speciesNames).toContain(ROBIN);
	});
});
