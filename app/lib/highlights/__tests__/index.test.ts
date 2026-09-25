import { describe, it, expect } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import {
	SESSION_DATE,
	PAST_PERIOD_TODAY,
	PRIOR_SUMMER_YEAR_ONE,
	PRIOR_AUTUMN_OTHER_YEAR,
	PRIOR_SUMMER_OTHER_YEAR,
	statsFor
} from './fixtures';
import { vitalStats, deriveLongAbsenceRetraps } from '..';

function weightRow(
	date: string,
	minWeight: number,
	maxWeight: number
): StatsPerDayAndSpeciesResult {
	return {
		visit_date: date,
		species_name: 'Blue Tit',
		encounter_count: 3,
		juv_count: 0,
		postjuv_count: 0,
		pullus_count: 0,
		weighed_birds_count: 3,
		min_weight: minWeight,
		max_weight: maxWeight
	};
}

// Regression guard for the top-level vitalStats + longAbsenceRetraps
// concatenation order for a representative fixture. Both the Counts (#989) and
// Rarities (#990) groups have since been removed from this module — the v2
// highlight pipeline (app/lib/highlights/v2) produces those sections now — so
// what's left to compose here is one group plus its sibling.
describe('SessionHighlight groups — top-level composition (integration)', () => {
	it('assembles vitalStats + longAbsenceRetraps in that order', () => {
		// Three earlier weighed days set the bar: the session's 13.1g is heavier
		// than all of them (an all-time heaviest record) while its 11g lightest
		// beats none, so exactly one highlight is derived.
		const results = [
			weightRow(PRIOR_SUMMER_YEAR_ONE, 10.5, 12.5),
			weightRow(PRIOR_AUTUMN_OTHER_YEAR, 10.6, 12.8),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, 10.7, 12.9),
			weightRow(SESSION_DATE, 11, 13.1)
		];
		const stats = statsFor(results);

		const vitalStatsHighlights = vitalStats({
			date: SESSION_DATE,
			stats,
			today: PAST_PERIOD_TODAY
		});
		const longAbsenceHighlights = deriveLongAbsenceRetraps([], SESSION_DATE);

		const flatList = [...vitalStatsHighlights, ...longAbsenceHighlights];

		expect(flatList.map((highlight) => highlight.type)).toEqual([
			'weight-record' // Blue Tit: heaviest ever at 13.1g
		]);
		expect(vitalStatsHighlights).toHaveLength(1);
		expect(longAbsenceHighlights).toEqual([]);
	});
});
