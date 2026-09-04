import { describe, it, expect } from 'vitest';
import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import {
	SESSION_DATE,
	LATER_DAY,
	PRIOR_SUMMER_OTHER_YEAR,
	speciesRow
} from '@/app/models/highlights/__tests__/fixtures';
import { deriveFirstEverSpecies } from '../derive-first-ever-species';

const FIRECREST = 'Firecrest';
const REED_WARBLER = 'Reed Warbler';

function deriveFirstEver(
	results: StatsPerDayAndSpeciesResult[],
	sessionDates?: string[]
) {
	const stats: SessionStatsData = {
		daySpeciesStats: results,
		sessionDates: sessionDates ?? [
			...new Set(results.map((row) => row.visit_date))
		]
	};
	return deriveFirstEverSpecies({ date: SESSION_DATE, stats });
}

describe('deriveFirstEverSpecies', () => {
	it('maps species whose earliest date is the session date to first-ever highlights', () => {
		const highlights = deriveFirstEver([
			speciesRow(SESSION_DATE, FIRECREST, 1),
			speciesRow(LATER_DAY, FIRECREST, 2),
			speciesRow(SESSION_DATE, REED_WARBLER, 3),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 2)
		]);
		// Firecrest appears for the first time on the session date
		expect(highlights).toContainEqual({
			type: 'first-ever-species',
			speciesName: FIRECREST,
			multipleIndividualsRecorded: false,
			isOnlyRecord: false
		});
		// Reed Warbler was seen before — not first-ever
		expect(highlights.map((h) => h.speciesName)).not.toContain(REED_WARBLER);
	});

	it('flags isOnlyRecord when the species appears on no other day', () => {
		const highlights = deriveFirstEver([
			speciesRow(SESSION_DATE, FIRECREST, 3),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 2)
		]);
		expect(highlights).toEqual([
			{
				type: 'first-ever-species',
				speciesName: FIRECREST,
				multipleIndividualsRecorded: true,
				isOnlyRecord: true
			}
		]);
	});

	it('does not flag isOnlyRecord when the species appears on a later day', () => {
		const highlights = deriveFirstEver([
			speciesRow(SESSION_DATE, FIRECREST, 3),
			speciesRow(LATER_DAY, FIRECREST, 1),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 2)
		]);
		expect(highlights).toEqual([
			{
				type: 'first-ever-species',
				speciesName: FIRECREST,
				multipleIndividualsRecorded: true,
				isOnlyRecord: false
			}
		]);
	});

	it("returns empty for the group's first-ever session", () => {
		// No prior session dates — every species would be first-ever, so suppress all
		const highlights = deriveFirstEver(
			[speciesRow(SESSION_DATE, FIRECREST, 1)],
			[SESSION_DATE]
		);
		expect(highlights).toEqual([]);
	});

	it('returns empty when no species is new', () => {
		const highlights = deriveFirstEver([
			speciesRow(SESSION_DATE, REED_WARBLER, 5),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 3)
		]);
		expect(highlights).toEqual([]);
	});
});
