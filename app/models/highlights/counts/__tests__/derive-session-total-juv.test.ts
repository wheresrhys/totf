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
import { deriveSessionTotalJuvRecords } from '../derive-session-total-juv';

const ROBIN = 'Robin';
const REED_WARBLER = 'Reed Warbler';

function deriveTotalJuvs(
	results: StatsPerDayAndSpeciesResult[],
	today = PAST_PERIOD_TODAY
) {
	return deriveSessionTotalJuvRecords({
		date: SESSION_DATE,
		stats: statsFor(results),
		today
	});
}

describe('deriveSessionTotalJuvRecords', () => {
	it('reports a most-juveniles record when the session juv total beats every day in scope', () => {
		const highlights = deriveTotalJuvs([
			juvRow(SESSION_DATE, ROBIN, 12),
			juvRow(SESSION_DATE, REED_WARBLER, 8),
			juvRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 5)
		]);
		expect(highlights).toContainEqual({
			type: 'session-total-juv-record',
			scope: 'all-time',
			value: 20,
			year: 2024,
			isCurrentYear: false
		});
	});

	it('sums juveniles across species for the session total', () => {
		const highlights = deriveTotalJuvs([
			juvRow(SESSION_DATE, ROBIN, 3),
			juvRow(SESSION_DATE, REED_WARBLER, 4),
			juvRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 6)
		]);
		// 3 + 4 = 7 beats the prior day's 6
		expect(highlights).toContainEqual(
			expect.objectContaining({ scope: 'all-time', value: 7 })
		);
	});

	it('returns nothing when the session has no juveniles', () => {
		const highlights = deriveTotalJuvs([
			juvRow(SESSION_DATE, ROBIN, 0, 40),
			juvRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 0, 5)
		]);
		expect(highlights).toHaveLength(0);
	});

	it('reports only the broadest scope when the session is a record in every scope', () => {
		const highlights = deriveTotalJuvs([
			juvRow(SESSION_DATE, ROBIN, 20),
			juvRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 10),
			juvRow(PRIOR_SUMMER_THIS_YEAR, ROBIN, 8)
		]);
		expect(highlights).toHaveLength(1);
		expect(highlights[0].scope).toBe('all-time');
	});

	it('reports this-year when the all-time record is beaten but this year is not', () => {
		const highlights = deriveTotalJuvs([
			juvRow(SESSION_DATE, ROBIN, 20),
			juvRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 30), // beats all-time
			juvRow(PRIOR_SUMMER_THIS_YEAR, ROBIN, 10) // this year, lower
		]);
		expect(highlights).toHaveLength(1);
		expect(highlights[0].scope).toBe('this-year');
	});

	it('reports an all-time tie older than a year as a for-N-years record', () => {
		const highlights = deriveTotalJuvs([
			juvRow(SESSION_DATE, ROBIN, 12),
			juvRow(PRIOR_AUTUMN_OTHER_YEAR, ROBIN, 12) // 2021 — 3 years ago
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				scope: 'all-time',
				value: 12,
				recordEqualledYearsAgo: 3
			})
		);
	});

	it('treats a tie held only by a later day as unreportable', () => {
		const highlights = deriveTotalJuvs([
			juvRow(SESSION_DATE, ROBIN, 12),
			juvRow(LATER_DAY, ROBIN, 12)
		]);
		expect(highlights).toHaveLength(0);
	});

	it('sets the current-year flag from the injected today', () => {
		const highlights = deriveTotalJuvs(
			[
				juvRow(SESSION_DATE, ROBIN, 12),
				juvRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 5)
			],
			new Date('2024-10-20')
		);
		expect(highlights[0].isCurrentYear).toBe(true);
	});
});
