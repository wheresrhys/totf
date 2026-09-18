import { describe, it, expect } from 'vitest';
import {
	SESSION_DATE,
	PAST_PERIOD_TODAY,
	PRIOR_SUMMER_OTHER_YEAR,
	speciesRow,
	statsFor
} from './fixtures';
import { rarities, counts, vitalStats, deriveLongAbsenceRetraps } from '..';

// Regression guard for #409's "no user-visible behaviour change" claim:
// asserts the top-level rarities + counts + vitalStats + longAbsenceRetraps
// concatenation order for a representative fixture. Two intentional
// deviations from the old flat machine's output, both approved in #409's PR
// description, apply here:
//  - long-absence-retrap now sorts LAST in the flat list (previously it sat
//    between the leading rarity families and the record block) — there are
//    none in this fixture, so the (empty) group is just appended.
//  - the cross-group rare-species suppression (old Rem-3) is left unwired in
//    #409 (#418's job), so Robin's own species-count-record — which the old
//    machine would have dropped because Robin is also a rare-species this
//    session — now survives into the Counts output.
describe('SessionHighlight groups — top-level composition (integration)', () => {
	it('assembles rarities + counts + vitalStats + longAbsenceRetraps in that order', () => {
		const results = [
			speciesRow(SESSION_DATE, 'Robin', 74),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, 'Robin', 30),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, 'Wren', 30)
		];
		const stats = statsFor(results);

		const raritiesHighlights = rarities({
			date: SESSION_DATE,
			stats,
			today: PAST_PERIOD_TODAY
		});
		const countsHighlights = counts({
			date: SESSION_DATE,
			stats,
			today: PAST_PERIOD_TODAY
		});
		const vitalStatsHighlights = vitalStats({
			date: SESSION_DATE,
			stats,
			today: PAST_PERIOD_TODAY
		});
		const longAbsenceHighlights = deriveLongAbsenceRetraps([], SESSION_DATE);

		const flatList = [
			...raritiesHighlights,
			...countsHighlights,
			...vitalStatsHighlights,
			...longAbsenceHighlights
		];

		expect(flatList.map((highlight) => highlight.type)).toEqual([
			'mega-species', // Robin: rare + first-of-year (only record of 2024)
			'session-total-record', // busiest session ever — 74 birds
			'species-count-record', // Robin's own count record — NOT suppressed
			'since-comparison' // quietest session since the prior day
		]);
		expect(raritiesHighlights).toHaveLength(1);
		expect(vitalStatsHighlights).toEqual([]);
		expect(longAbsenceHighlights).toEqual([]);
	});
});
