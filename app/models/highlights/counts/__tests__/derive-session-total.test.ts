import { describe, it, expect } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import {
	SESSION_DATE,
	PAST_PERIOD_TODAY,
	PRIOR_AUTUMN_OTHER_YEAR,
	PRIOR_SUMMER_OTHER_YEAR,
	PRIOR_SUMMER_THIS_YEAR,
	LATER_DAY,
	dayRows
} from '@/app/models/highlights/__tests__/fixtures';
import { deriveSessionTotalRecords } from '../derive-session-total';

function derive(
	results: StatsPerDayAndSpeciesResult[],
	today = PAST_PERIOD_TODAY
) {
	return deriveSessionTotalRecords({
		date: SESSION_DATE,
		stats: {
			daySpeciesStats: results,
			sessionDates: [...new Set(results.map((row) => row.visit_date))]
		},
		today
	});
}

describe('deriveSessionTotalRecords', () => {
	it('returns a busiest record when the session total beats all other days in scope', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 40, Chiffchaff: 34 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, {
				Robin: 20,
				Chiffchaff: 20,
				Wren: 20
			})
		]);
		expect(highlights).toContainEqual({
			type: 'session-total-record',
			metric: 'encounters',
			scope: 'all-time',
			value: 74,
			year: 2024,
			isCurrentYear: false
		});
		// three species on the prior day vs two today — no variety record
		expect(
			highlights.filter((highlight) => highlight.metric === 'species')
		).toEqual([]);
	});

	it('returns a most-varied record from per-day species counts', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 1, Chiffchaff: 1, Wren: 1 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 30, Chiffchaff: 30 })
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				metric: 'species',
				scope: 'all-time',
				value: 3
			})
		);
		expect(
			highlights.filter((highlight) => highlight.metric === 'encounters')
		).toEqual([]);
	});

	it('counts later sessions when finding records', () => {
		// the later day beats the session in every scope — no record
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 60 }),
			...dayRows(LATER_DAY, { Robin: 200, Chiffchaff: 200 })
		]);
		expect(
			highlights.filter((highlight) => highlight.metric === 'encounters')
		).toEqual([]);
	});

	it('holds a record when later sessions are all lower', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 60 }),
			...dayRows(LATER_DAY, { Robin: 50 })
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				metric: 'encounters',
				scope: 'all-time',
				value: 74
			})
		);
	});

	it('uses a later session as the comparison baseline', () => {
		// previously suppressed as the group's first session; a later
		// session now provides the required comparison
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(LATER_DAY, { Robin: 50 })
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				metric: 'encounters',
				scope: 'all-time',
				value: 74
			})
		);
	});

	it('treats a tie held only by a later session as unreportable', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(LATER_DAY, { Robin: 74 })
		]);
		expect(
			highlights.filter((highlight) => highlight.metric === 'encounters')
		).toEqual([]);
	});

	it('computes for-N-years from prior tied days even when a later day also ties', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_AUTUMN_OTHER_YEAR, { Robin: 74 }),
			...dayRows(LATER_DAY, { Robin: 74 })
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				metric: 'encounters',
				scope: 'all-time',
				value: 74,
				recordEqualledYearsAgo: 3
			})
		);
	});

	it('reports only all-time when every scope is a record', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 60 }),
			...dayRows(PRIOR_SUMMER_THIS_YEAR, { Robin: 50 })
		]);
		const encounterRecords = highlights.filter(
			(highlight) => highlight.metric === 'encounters'
		);
		expect(encounterRecords.length).toBe(1);
		expect(encounterRecords[0].scope).toBe('all-time');
	});

	it('reports this-year when the all-time record is beaten but this year is not', () => {
		// all-time beaten by a big prior-year day, but this year's best is beaten
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 100 }),
			...dayRows(PRIOR_SUMMER_THIS_YEAR, { Robin: 60 })
		]);
		expect(
			highlights.find((highlight) => highlight.metric === 'encounters')?.scope
		).toBe('this-year');
	});

	it('reports an all-time tie as for-N-years when the tied day is over a year old', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_AUTUMN_OTHER_YEAR, { Robin: 74 })
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				metric: 'encounters',
				scope: 'all-time',
				value: 74,
				recordEqualledYearsAgo: 3
			})
		);
	});

	it('ignores ties under a year old', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_SUMMER_THIS_YEAR, { Robin: 74 })
		]);
		expect(
			highlights.filter((highlight) => highlight.metric === 'encounters')
		).toEqual([]);
	});

	it('ignores a this-year tie', () => {
		// all-time beaten by a prior-year day; this year's best merely ties the
		// session, which is not a this-year record
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 100 }),
			...dayRows(PRIOR_SUMMER_THIS_YEAR, { Robin: 74 })
		]);
		expect(
			highlights.filter((highlight) => highlight.metric === 'encounters')
		).toEqual([]);
	});

	it('suppresses records when no other session exists in scope', () => {
		// the group's only session would otherwise be a record for everything
		expect(derive(dayRows(SESSION_DATE, { Robin: 74, Chiffchaff: 3 }))).toEqual(
			[]
		);
	});

	it('marks the session year current when today falls within it', () => {
		const highlights = derive(
			[
				...dayRows(SESSION_DATE, { Robin: 74 }),
				...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 60 })
			],
			new Date('2024-10-20')
		);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				metric: 'encounters',
				isCurrentYear: true
			})
		);
	});

	it('counts zero-encounter sessions as comparison sessions in scope', () => {
		const stats: SessionStatsData = {
			daySpeciesStats: dayRows(SESSION_DATE, { Robin: 74 }),
			sessionDates: [PRIOR_SUMMER_OTHER_YEAR, SESSION_DATE]
		};
		const highlights = deriveSessionTotalRecords({
			date: SESSION_DATE,
			stats
		});
		expect(highlights).toContainEqual(
			expect.objectContaining({
				metric: 'encounters',
				scope: 'all-time',
				value: 74
			})
		);
	});
});
