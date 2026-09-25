import { describe, it, expect } from 'vitest';
import {
	SESSION_DATE,
	PAST_PERIOD_TODAY,
	PRIOR_SUMMER_OTHER_YEAR,
	speciesRow,
	statsFor
} from './fixtures';
import { rarities, vitalStats, deriveLongAbsenceRetraps } from '..';

// Regression guard for the top-level rarities + vitalStats +
// longAbsenceRetraps concatenation order for a representative fixture. The
// Counts group has been removed from this module (superseded by the v2
// highlight pipeline, app/lib/highlights/v2) — it's no longer part of this
// composition, so this fixture (previously exercising a Counts-group record
// too) now only produces a Rarities highlight.
describe('SessionHighlight groups — top-level composition (integration)', () => {
	it('assembles rarities + vitalStats + longAbsenceRetraps in that order', () => {
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
		const vitalStatsHighlights = vitalStats({
			date: SESSION_DATE,
			stats,
			today: PAST_PERIOD_TODAY
		});
		const longAbsenceHighlights = deriveLongAbsenceRetraps([], SESSION_DATE);

		const flatList = [
			...raritiesHighlights,
			...vitalStatsHighlights,
			...longAbsenceHighlights
		];

		expect(flatList.map((highlight) => highlight.type)).toEqual([
			'mega-species' // Robin: rare + first-of-year (only record of 2024)
		]);
		expect(raritiesHighlights).toHaveLength(1);
		expect(vitalStatsHighlights).toEqual([]);
		expect(longAbsenceHighlights).toEqual([]);
	});
});
