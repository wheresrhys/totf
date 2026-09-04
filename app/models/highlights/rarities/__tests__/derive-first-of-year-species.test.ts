import { describe, it, expect } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import {
	SESSION_DATE,
	PAST_PERIOD_TODAY,
	LATER_DAY,
	PRIOR_SUMMER_OTHER_YEAR,
	PRIOR_SUMMER_THIS_YEAR,
	speciesRow
} from '@/app/models/highlights/__tests__/fixtures';
import { deriveFirstOfYearSpecies } from '../derive-first-of-year-species';

const FIRECREST = 'Firecrest';
const REED_WARBLER = 'Reed Warbler';

function deriveFirstOfYear(
	results: StatsPerDayAndSpeciesResult[],
	{
		sessionDates,
		today = PAST_PERIOD_TODAY
	}: { sessionDates?: string[]; today?: Date } = {}
) {
	const stats: SessionStatsData = {
		daySpeciesStats: results,
		sessionDates: sessionDates ?? [
			...new Set(results.map((row) => row.visit_date))
		]
	};
	return deriveFirstOfYearSpecies({ date: SESSION_DATE, stats, today });
}

describe('deriveFirstOfYearSpecies', () => {
	it('maps species first seen this year on the session date to first-of-year highlights', () => {
		const highlights = deriveFirstOfYear([
			speciesRow(SESSION_DATE, FIRECREST, 1),
			speciesRow(LATER_DAY, FIRECREST, 2),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, FIRECREST, 2),
			speciesRow(SESSION_DATE, REED_WARBLER, 3),
			speciesRow(PRIOR_SUMMER_THIS_YEAR, REED_WARBLER, 2)
		]);
		// Firecrest was seen in a previous year but not yet this year
		expect(highlights).toEqual([
			{
				type: 'first-of-year-species',
				speciesName: FIRECREST,
				year: 2024,
				isCurrentYear: false,
				multipleIndividualsRecorded: false,
				isOnlyRecord: false
			}
		]);
	});

	it('flags isOnlyRecord when the species appears on no other day this year', () => {
		// Prior-year records are what make it first-of-year — they don't
		// revoke the "only" copy
		const highlights = deriveFirstOfYear([
			speciesRow(SESSION_DATE, FIRECREST, 2),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, FIRECREST, 4),
			speciesRow(PRIOR_SUMMER_THIS_YEAR, REED_WARBLER, 2)
		]);
		expect(highlights).toEqual([
			{
				type: 'first-of-year-species',
				speciesName: FIRECREST,
				year: 2024,
				isCurrentYear: false,
				multipleIndividualsRecorded: true,
				isOnlyRecord: true
			}
		]);
	});

	it('does not flag isOnlyRecord when the species appears later in the same year', () => {
		const highlights = deriveFirstOfYear([
			speciesRow(SESSION_DATE, FIRECREST, 2),
			speciesRow(LATER_DAY, FIRECREST, 1),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, FIRECREST, 4),
			speciesRow(PRIOR_SUMMER_THIS_YEAR, REED_WARBLER, 2)
		]);
		expect(highlights).toEqual([
			{
				type: 'first-of-year-species',
				speciesName: FIRECREST,
				year: 2024,
				isCurrentYear: false,
				multipleIndividualsRecorded: true,
				isOnlyRecord: false
			}
		]);
	});

	it('excludes first-ever species — the first-ever highlight covers them', () => {
		const highlights = deriveFirstOfYear([
			speciesRow(SESSION_DATE, FIRECREST, 1),
			speciesRow(PRIOR_SUMMER_THIS_YEAR, REED_WARBLER, 2)
		]);
		expect(highlights).toEqual([]);
	});

	it('flags the current year when today is within the session year', () => {
		const highlights = deriveFirstOfYear(
			[
				speciesRow(SESSION_DATE, FIRECREST, 1),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, FIRECREST, 2),
				speciesRow(PRIOR_SUMMER_THIS_YEAR, REED_WARBLER, 2)
			],
			{ today: new Date('2024-10-01') }
		);
		expect(highlights).toEqual([
			expect.objectContaining({ speciesName: FIRECREST, isCurrentYear: true })
		]);
	});

	it("reports first-of-year species on the group's first session of the year", () => {
		// Prior sessions exist, but none this year — the first session of the
		// year is the spring-arrival roll-call, so returning species are still
		// reported (the combine rule collapses a long list into one line)
		const highlights = deriveFirstOfYear([
			speciesRow(SESSION_DATE, FIRECREST, 1),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, FIRECREST, 2)
		]);
		expect(highlights).toEqual([
			{
				type: 'first-of-year-species',
				speciesName: FIRECREST,
				year: 2024,
				isCurrentYear: false,
				multipleIndividualsRecorded: false,
				isOnlyRecord: true
			}
		]);
	});

	it('returns empty when every species was already seen this year', () => {
		const highlights = deriveFirstOfYear([
			speciesRow(SESSION_DATE, REED_WARBLER, 5),
			speciesRow(PRIOR_SUMMER_THIS_YEAR, REED_WARBLER, 3)
		]);
		expect(highlights).toEqual([]);
	});
});
