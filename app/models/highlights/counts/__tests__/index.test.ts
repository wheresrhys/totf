import { describe, it, expect } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import {
	SESSION_DATE,
	PAST_PERIOD_TODAY,
	PRIOR_SUMMER_OTHER_YEAR,
	statsFor
} from '@/app/models/highlights/__tests__/fixtures';
import { runCountsGroup } from '..';

function row(
	date: string,
	species: string,
	encounterCount: number,
	juvCount = 0
): StatsPerDayAndSpeciesResult {
	return {
		visit_date: date,
		species_name: species,
		encounter_count: encounterCount,
		juv_count: juvCount,
		postjuv_count: 0,
		pullus_count: 0,
		weighed_birds_count: 0,
		min_weight: 0,
		max_weight: 0
	};
}

// One session holding a record in every Counts block:
// - Robin + Wren beat both the busiest and most-varied all-time records over
//   the same scope, folding into one combined-session-total-record
//   (sessionMagnitudeBlock)
// - Robin and Chiffchaff each hold their own all-time species-count record
//   (speciesCountBlock, generation order: Robin appears before Chiffchaff)
// - Robin also holds the session-total-juv record and its own
//   species-juv-count record (juvBlock)
// - the quiet prior day gives a quietest-since comparison (sinceBlock) —
//   busiest-since never becomes a candidate here (every prior day is quieter)
describe('runCountsGroup — block concatenation (integration)', () => {
	it('composes [sessionMagnitudeBlock, speciesCountBlock, juvBlock, sinceBlock] in that order', () => {
		const results = [
			row(SESSION_DATE, 'Robin', 50, 20),
			row(SESSION_DATE, 'Wren', 1),
			row(SESSION_DATE, 'Chiffchaff', 8),
			row(PRIOR_SUMMER_OTHER_YEAR, 'Robin', 10, 5),
			row(PRIOR_SUMMER_OTHER_YEAR, 'Chiffchaff', 3)
		];
		const highlights = runCountsGroup({
			date: SESSION_DATE,
			stats: statsFor(results),
			today: PAST_PERIOD_TODAY
		});
		expect(highlights.map((highlight) => highlight.type)).toEqual([
			'combined-session-total-record',
			'species-count-record',
			'species-count-record',
			'session-total-juv-record',
			'species-juv-count-record',
			'since-comparison'
		]);
		const sessionTotal = highlights[0];
		const speciesJuv = highlights[4];
		const since = highlights[5];
		if (
			sessionTotal.type !== 'combined-session-total-record' ||
			speciesJuv.type !== 'species-juv-count-record' ||
			since.type !== 'since-comparison'
		) {
			throw new Error('unexpected highlight shape');
		}
		const speciesCountNames = highlights.slice(1, 3).map((highlight) => {
			if (highlight.type !== 'species-count-record') {
				throw new Error('unexpected highlight shape');
			}
			return highlight.speciesName;
		});
		expect(sessionTotal.encounterValue).toBe(59);
		expect(sessionTotal.speciesValue).toBe(3);
		expect(speciesCountNames).toEqual(['Robin', 'Chiffchaff']);
		expect(speciesJuv.speciesName).toBe('Robin');
		expect(since.kind).toBe('quietest');
	});
});
