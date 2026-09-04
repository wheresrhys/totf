import { describe, it, expect } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import {
	SESSION_DATE,
	PRIOR_SUMMER_OTHER_YEAR,
	PRIOR_SUMMER_THIS_YEAR,
	dayRows
} from '@/app/models/highlights/__tests__/fixtures';
import { deriveSinceHighlights } from '../derive-since-comparison';

const WITHIN_A_MONTH = '2024-08-20';

function deriveSince(
	results: StatsPerDayAndSpeciesResult[],
	sessionDates?: string[]
) {
	const stats: SessionStatsData = {
		daySpeciesStats: results,
		sessionDates: sessionDates ?? [
			...new Set(results.map((row) => row.visit_date))
		]
	};
	return deriveSinceHighlights({ date: SESSION_DATE, stats });
}

describe('deriveSinceHighlights', () => {
	it('returns busiest-since using the most recent prior session day with an equal-or-higher total', () => {
		// two prior days at/above the session total; the more recent one
		// (PRIOR_SUMMER_THIS_YEAR) is the since date. A newer, quieter day gives
		// quietest-since a later since date, so busiest wins the earlier-date
		// tie-break and is the only highlight.
		const highlights = deriveSince([
			...dayRows(SESSION_DATE, { Robin: 41 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 50 }),
			...dayRows(PRIOR_SUMMER_THIS_YEAR, { Robin: 45 }),
			...dayRows('2024-07-01', { Robin: 10 })
		]);
		expect(highlights).toEqual([
			{
				type: 'since-comparison',
				kind: 'busiest',
				value: 41,
				sinceDate: PRIOR_SUMMER_THIS_YEAR
			}
		]);
	});

	it('returns quietest-since using the most recent prior session day with an equal-or-lower total', () => {
		const highlights = deriveSince([
			...dayRows(SESSION_DATE, { Robin: 3 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 1 }),
			...dayRows(PRIOR_SUMMER_THIS_YEAR, { Robin: 2 }),
			...dayRows(WITHIN_A_MONTH, { Robin: 40 })
		]);
		expect(highlights).toContainEqual({
			type: 'since-comparison',
			kind: 'quietest',
			value: 3,
			sinceDate: PRIOR_SUMMER_THIS_YEAR
		});
	});

	it('counts zero-encounter session days in quietest comparisons', () => {
		// PRIOR_SUMMER_THIS_YEAR is a zero-encounter session day (no rows) — it
		// undershoots the session and, being the most recent qualifying day, is
		// the quietest-since date. No prior day reaches the session total, so
		// busiest is suppressed and only the zero-day-driven quietest is left.
		const highlights = deriveSince(
			[
				...dayRows(SESSION_DATE, { Robin: 5 }),
				...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 3 })
			],
			[PRIOR_SUMMER_OTHER_YEAR, PRIOR_SUMMER_THIS_YEAR, SESSION_DATE]
		);
		expect(highlights).toEqual([
			{
				type: 'since-comparison',
				kind: 'quietest',
				value: 5,
				sinceDate: PRIOR_SUMMER_THIS_YEAR
			}
		]);
	});

	it('suppresses busiest when no prior day qualifies (duplicate of all-time record)', () => {
		const highlights = deriveSince([
			...dayRows(SESSION_DATE, { Robin: 100 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 40 })
		]);
		expect(highlights.map((highlight) => highlight.kind)).not.toContain(
			'busiest'
		);
	});

	it('reports quietest-ever when no prior day qualifies and prior sessions exist', () => {
		const highlights = deriveSince([
			...dayRows(SESSION_DATE, { Robin: 3 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 40 })
		]);
		expect(highlights).toContainEqual({
			type: 'since-comparison',
			kind: 'quietest',
			value: 3
		});
	});

	it("suppresses quietest-ever for the group's first session", () => {
		expect(deriveSince(dayRows(SESSION_DATE, { Robin: 3 }))).toEqual([]);
	});

	it('suppresses comparisons whose since date is within one month of the session', () => {
		// The only prior day equals the session total, qualifying for both
		// busiest-since and quietest-since — but it sits within a month of the
		// session, so both are suppressed (and it isn't a quietest-ever case
		// because a qualifying prior day does exist)
		const highlights = deriveSince([
			...dayRows(SESSION_DATE, { Robin: 20 }),
			...dayRows(WITHIN_A_MONTH, { Robin: 20 })
		]);
		expect(highlights).toEqual([]);
	});

	it('reports only the comparison with the earlier since date when both qualify', () => {
		// busiest-since reaches back to the older summer day; quietest-since only
		// to the more recent one — busiest wins
		const highlights = deriveSince([
			...dayRows(SESSION_DATE, { Robin: 20 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 30 }),
			...dayRows(PRIOR_SUMMER_THIS_YEAR, { Robin: 10 })
		]);
		expect(highlights).toEqual([
			{
				type: 'since-comparison',
				kind: 'busiest',
				value: 20,
				sinceDate: PRIOR_SUMMER_OTHER_YEAR
			}
		]);
	});
});
