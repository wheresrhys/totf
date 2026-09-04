import { describe, it, expect } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import {
	SESSION_DATE,
	PRIOR_AUTUMN_OTHER_YEAR,
	PRIOR_SUMMER_OTHER_YEAR,
	PRIOR_SUMMER_THIS_YEAR,
	LATER_DAY,
	LATER_DAY_TWO,
	speciesRow
} from '@/app/models/highlights/__tests__/fixtures';
import { deriveRareSpecies } from '../derive-rare-species';

const FIRECREST = 'Firecrest';
const REED_WARBLER = 'Reed Warbler';
const ROBIN = 'Robin';

function deriveRare(
	results: StatsPerDayAndSpeciesResult[],
	sessionDates?: string[]
) {
	const stats: SessionStatsData = {
		daySpeciesStats: results,
		sessionDates: sessionDates ?? [
			...new Set(results.map((row) => row.visit_date))
		]
	};
	return deriveRareSpecies({ date: SESSION_DATE, stats });
}

describe('deriveRareSpecies', () => {
	it('highlights a species seen on only two session days ever', () => {
		const highlights = deriveRare([
			speciesRow(SESSION_DATE, FIRECREST, 1),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, FIRECREST, 1)
		]);
		expect(highlights).toEqual([
			{
				type: 'rare-species',
				speciesName: FIRECREST,
				totalSessionDays: 2
			}
		]);
	});

	it('highlights a species seen on exactly three session days ever', () => {
		const highlights = deriveRare([
			speciesRow(SESSION_DATE, FIRECREST, 2),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, FIRECREST, 1),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, FIRECREST, 3)
		]);
		expect(highlights).toEqual([
			{
				type: 'rare-species',
				speciesName: FIRECREST,
				totalSessionDays: 3
			}
		]);
	});

	it('counts later days towards the total', () => {
		// prior + session + two later = 4 days, above the threshold
		const highlights = deriveRare([
			speciesRow(SESSION_DATE, FIRECREST, 1),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, FIRECREST, 1),
			speciesRow(LATER_DAY, FIRECREST, 1),
			speciesRow(LATER_DAY_TWO, FIRECREST, 1)
		]);
		expect(highlights).toEqual([]);
	});

	it('excludes a species seen on more than three session days ever', () => {
		const highlights = deriveRare([
			speciesRow(SESSION_DATE, FIRECREST, 1),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, FIRECREST, 1),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, FIRECREST, 1),
			speciesRow(PRIOR_SUMMER_THIS_YEAR, FIRECREST, 1)
		]);
		expect(highlights).toEqual([]);
	});

	it('excludes a first-ever species — the first-ever highlight covers it', () => {
		// Firecrest appears only from the session onwards (no earlier day)
		const highlights = deriveRare([
			speciesRow(SESSION_DATE, FIRECREST, 1),
			speciesRow(LATER_DAY, FIRECREST, 1)
		]);
		expect(highlights).toEqual([]);
	});

	it('reports multiple rare species from one session', () => {
		const highlights = deriveRare([
			speciesRow(SESSION_DATE, FIRECREST, 1),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, FIRECREST, 1),
			speciesRow(SESSION_DATE, REED_WARBLER, 1),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, REED_WARBLER, 1)
		]);
		expect(highlights.map((h) => h.speciesName)).toEqual([
			FIRECREST,
			REED_WARBLER
		]);
	});

	it('does not highlight common species', () => {
		const highlights = deriveRare([
			speciesRow(SESSION_DATE, ROBIN, 5),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 4),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, ROBIN, 3),
			speciesRow(PRIOR_SUMMER_THIS_YEAR, ROBIN, 6)
		]);
		expect(highlights).toEqual([]);
	});
});
