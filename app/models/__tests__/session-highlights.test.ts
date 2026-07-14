import { describe, it, expect } from 'vitest';
import {
	buildHighlightSentence,
	deriveFirstEverSpecies,
	deriveSessionTotalRecords,
	deriveSpeciesRecords,
	type FirstEverSpeciesHighlight,
	type SessionStatsData,
	type SessionTotalRecordHighlight,
	type SpeciesCountRecordHighlight
} from '../session-highlights';
import type { DaySpeciesMetricRow } from '@/app/models/db';

const SESSION_DATE = '2024-09-15'; // autumn
// A fixed "today" after the session's year and season, so current-period
// flags are deterministically false unless a test passes its own today
const PAST_PERIOD_TODAY = new Date('2025-06-01');

// Comparison days used across tests, chosen for their scope membership
// relative to SESSION_DATE:
const PRIOR_AUTUMN_OTHER_YEAR = '2021-09-10'; // any-season only (3+ years ago)
const PRIOR_SPRING_OTHER_YEAR = '2022-05-01'; // all-time only
const PRIOR_SPRING_THIS_YEAR = '2024-05-01'; // this-year (and all-time)
const PRIOR_THIS_SEASON = '2024-08-20'; // this-season (and all narrower)
const LATER_DAY = '2024-10-01'; // after the session, but in every scope
const LATER_DAY_TWO = '2024-10-05';
const LATER_DAY_THREE = '2024-10-20';
// Additional all-time-only days for multi-day placement-tier scenarios
const PRIOR_SPRING_YEAR_ONE = '2021-05-01';
const PRIOR_SPRING_YEAR_ONE_LATER = '2021-05-15';
const PRIOR_SPRING_YEAR_THREE = '2023-05-01';

function dayRows(
	date: string,
	speciesCounts: Record<string, number>
): DaySpeciesMetricRow[] {
	return Object.entries(speciesCounts).map(([species_name, metric_value]) => ({
		species_name,
		visit_date: date,
		metric_value
	}));
}

function statsFor(rows: DaySpeciesMetricRow[]): SessionStatsData {
	return {
		daySpeciesCounts: rows,
		sessionDates: [...new Set(rows.map((row) => row.visit_date))]
	};
}

function derive(rows: DaySpeciesMetricRow[], today = PAST_PERIOD_TODAY) {
	return deriveSessionTotalRecords({
		date: SESSION_DATE,
		stats: statsFor(rows),
		today
	});
}

describe('deriveSessionTotalRecords', () => {
	it('returns a busiest record when the session total beats all other days in scope', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 40, Chiffchaff: 34 }),
			...dayRows(PRIOR_SPRING_OTHER_YEAR, {
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
			seasonName: 'autumn',
			year: 2024,
			isCurrentYear: false,
			isCurrentSeason: false,
			seasonPeriodLabel: 'autumn 2024'
		});
		// three species on the prior day vs two today — no variety record
		expect(
			highlights.filter((highlight) => highlight.metric === 'species')
		).toEqual([]);
	});

	it('returns a most-varied record from per-day species counts', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 1, Chiffchaff: 1, Wren: 1 }),
			...dayRows(PRIOR_SPRING_OTHER_YEAR, { Robin: 30, Chiffchaff: 30 })
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
			...dayRows(PRIOR_SPRING_OTHER_YEAR, { Robin: 60 }),
			...dayRows(LATER_DAY, { Robin: 200, Chiffchaff: 200 })
		]);
		expect(
			highlights.filter((highlight) => highlight.metric === 'encounters')
		).toEqual([]);
	});

	it('holds a record when later sessions are all lower', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_SPRING_OTHER_YEAR, { Robin: 60 }),
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

	it('reports only all-time when all scopes are records', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_AUTUMN_OTHER_YEAR, { Robin: 60 }),
			...dayRows(PRIOR_SPRING_THIS_YEAR, { Robin: 50 }),
			...dayRows(PRIOR_THIS_SEASON, { Robin: 40 })
		]);
		const encounterRecords = highlights.filter(
			(highlight) => highlight.metric === 'encounters'
		);
		expect(encounterRecords.length).toBe(1);
		expect(encounterRecords[0].scope).toBe('all-time');
	});

	it('prefers any-season over this-year and this-year over this-season', () => {
		// all-time beaten by a big spring day, but best autumn day is beaten
		const anySeason = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_SPRING_OTHER_YEAR, { Robin: 100 }),
			...dayRows(PRIOR_AUTUMN_OTHER_YEAR, { Robin: 60 })
		]);
		expect(
			anySeason.find((highlight) => highlight.metric === 'encounters')?.scope
		).toBe('any-season');

		// all-time and any-season beaten by a big autumn day in another year,
		// but this year's best is beaten
		const thisYear = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_AUTUMN_OTHER_YEAR, { Robin: 100 }),
			...dayRows(PRIOR_SPRING_THIS_YEAR, { Robin: 60 }),
			...dayRows(PRIOR_THIS_SEASON, { Robin: 50 })
		]);
		expect(
			thisYear.find((highlight) => highlight.metric === 'encounters')?.scope
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
			...dayRows(PRIOR_SPRING_THIS_YEAR, { Robin: 74 })
		]);
		expect(
			highlights.filter((highlight) => highlight.metric === 'encounters')
		).toEqual([]);
	});

	it('ignores ties in narrower scopes', () => {
		// all-time beaten, any-season tied — the tie is not reportable there
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_SPRING_OTHER_YEAR, { Robin: 100 }),
			...dayRows(PRIOR_AUTUMN_OTHER_YEAR, { Robin: 74 })
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

	it('marks the session year and season current when today falls within them', () => {
		const highlights = derive(
			[
				...dayRows(SESSION_DATE, { Robin: 74 }),
				...dayRows(PRIOR_SPRING_OTHER_YEAR, { Robin: 60 })
			],
			new Date('2024-10-20')
		);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				metric: 'encounters',
				isCurrentYear: true,
				isCurrentSeason: true
			})
		);
	});

	it('counts zero-encounter sessions as comparison sessions in scope', () => {
		const stats: SessionStatsData = {
			daySpeciesCounts: dayRows(SESSION_DATE, { Robin: 74 }),
			sessionDates: [PRIOR_SPRING_OTHER_YEAR, SESSION_DATE]
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

function makeHighlight(
	overrides: Partial<SessionTotalRecordHighlight>
): SessionTotalRecordHighlight {
	return {
		type: 'session-total-record',
		metric: 'encounters',
		scope: 'all-time',
		value: 74,
		seasonName: 'autumn',
		year: 2024,
		isCurrentYear: false,
		isCurrentSeason: false,
		seasonPeriodLabel: 'autumn 2024',
		...overrides
	};
}

describe('buildHighlightSentence — session-total-record', () => {
	it('renders all-time busiest copy', () => {
		expect(buildHighlightSentence(makeHighlight({}))).toBe(
			'Busiest session ever — 74 birds'
		);
	});

	it('renders any-season busiest copy', () => {
		expect(buildHighlightSentence(makeHighlight({ scope: 'any-season' }))).toBe(
			'Busiest autumn session ever — 74 birds'
		);
	});

	it('renders this-year busiest copy as "this year" for a current-year session', () => {
		expect(
			buildHighlightSentence(
				makeHighlight({ scope: 'this-year', isCurrentYear: true })
			)
		).toBe('Busiest session this year — 74 birds');
	});

	it('renders this-year busiest copy with the year for a past session', () => {
		expect(buildHighlightSentence(makeHighlight({ scope: 'this-year' }))).toBe(
			'Busiest session of 2024 — 74 birds'
		);
	});

	it('renders this-season busiest copy as "this <season>" for a current-season session', () => {
		expect(
			buildHighlightSentence(
				makeHighlight({ scope: 'this-season', isCurrentSeason: true })
			)
		).toBe('Busiest session this autumn — 74 birds');
	});

	it('renders this-season busiest copy with the season period for a past session', () => {
		expect(
			buildHighlightSentence(makeHighlight({ scope: 'this-season' }))
		).toBe('Busiest session in autumn 2024 — 74 birds');
	});

	it('renders past winter copy with the split-year label', () => {
		expect(
			buildHighlightSentence(
				makeHighlight({
					scope: 'this-season',
					seasonName: 'winter',
					seasonPeriodLabel: 'winter 2023/24'
				})
			)
		).toBe('Busiest session in winter 2023/24 — 74 birds');
	});

	it('renders most-varied copy for the species metric', () => {
		expect(
			buildHighlightSentence(makeHighlight({ metric: 'species', value: 18 }))
		).toBe('Most varied session ever — 18 species');
	});

	it('renders busiest-for-N-years copy for an all-time tie', () => {
		expect(
			buildHighlightSentence(makeHighlight({ recordEqualledYearsAgo: 3 }))
		).toBe('Busiest session for 3 years — 74 birds');
	});
});

// ---- deriveSpeciesRecords ----

const REED_WARBLER = 'Reed Warbler';
const ROBIN = 'Robin';

function speciesRow(
	date: string,
	species: string,
	count: number
): DaySpeciesMetricRow {
	return { visit_date: date, species_name: species, metric_value: count };
}

function statsForSpecies(rows: DaySpeciesMetricRow[]): SessionStatsData {
	return {
		daySpeciesCounts: rows,
		sessionDates: [...new Set(rows.map((row) => row.visit_date))]
	};
}

function deriveSpecies(rows: DaySpeciesMetricRow[], today = PAST_PERIOD_TODAY) {
	return deriveSpeciesRecords({
		date: SESSION_DATE,
		stats: statsForSpecies(rows),
		today
	});
}

describe('deriveSpeciesRecords', () => {
	it('reports the broadest scope achieved per species', () => {
		// All-time beaten: prior autumn (any-season) had 5, but a spring day also had 5
		// Session has 10, so it beats all-time
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, REED_WARBLER, 5),
			speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 5)
		]);
		expect(highlights).toHaveLength(1);
		expect(highlights[0]).toMatchObject({
			type: 'species-count-record',
			speciesName: REED_WARBLER,
			scope: 'all-time',
			value: 10
		});
	});

	it('reports multiple species records from one session', () => {
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(SESSION_DATE, ROBIN, 8),
			speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 5),
			speciesRow(PRIOR_SPRING_OTHER_YEAR, ROBIN, 3)
		]);
		const speciesNames = highlights.map((h) => h.speciesName);
		expect(speciesNames).toContain(REED_WARBLER);
		expect(speciesNames).toContain(ROBIN);
	});

	it('requires the species to appear on another day in scope', () => {
		// Reed Warbler only appears on the session day — no other day, no record
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_SPRING_OTHER_YEAR, ROBIN, 3)
		]);
		expect(highlights.map((h) => h.speciesName)).not.toContain(REED_WARBLER);
	});

	it('demotes the session to a placement when a later day has a higher count', () => {
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 5),
			speciesRow(LATER_DAY, REED_WARBLER, 100)
		]);
		expect(highlights).toHaveLength(1);
		expect(highlights[0]).toMatchObject({
			speciesName: REED_WARBLER,
			scope: 'all-time',
			value: 10,
			placementRank: 2,
			isJointPlacement: false
		});
	});

	it('reports a joint best day when only a later day ties the session count', () => {
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(LATER_DAY, REED_WARBLER, 10)
		]);
		expect(highlights).toHaveLength(1);
		expect(highlights[0]).toMatchObject({
			speciesName: REED_WARBLER,
			scope: 'all-time',
			value: 10,
			placementRank: 1,
			isJointPlacement: true
		});
	});

	it('keeps the for-N-years copy for an old prior tie even when a later day also ties', () => {
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, REED_WARBLER, 10),
			speciesRow(LATER_DAY, REED_WARBLER, 10)
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				speciesName: REED_WARBLER,
				scope: 'all-time',
				value: 10,
				recordEqualledYearsAgo: 3
			})
		);
	});

	it('reports an all-time tie older than a year as a for-N-years record', () => {
		// Prior date is >1 year before SESSION_DATE (2024-09-15)
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, REED_WARBLER, 10) // 2021-09-10 — 3 years ago
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				speciesName: REED_WARBLER,
				scope: 'all-time',
				value: 10,
				recordEqualledYearsAgo: 3
			})
		);
	});

	it('reports an all-time tie under a year old as a joint best day', () => {
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_SPRING_THIS_YEAR, REED_WARBLER, 10) // 2024-05-01 — < 1 year
		]);
		expect(highlights).toHaveLength(1);
		expect(highlights[0]).toMatchObject({
			speciesName: REED_WARBLER,
			scope: 'all-time',
			value: 10,
			placementRank: 1,
			isJointPlacement: true
		});
	});

	it('ignores ties in narrower scopes', () => {
		// all-time placements blocked by three days at the top value,
		// any-season tied — the tie is not reportable there
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 20),
			speciesRow(PRIOR_SPRING_YEAR_ONE, REED_WARBLER, 20),
			speciesRow(PRIOR_SPRING_YEAR_THREE, REED_WARBLER, 20),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, REED_WARBLER, 10) // any-season tie
		]);
		expect(highlights).toHaveLength(0);
	});

	it('never reports a species highlight when the session count is 1', () => {
		// would otherwise be a record-equalling day
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 1),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, REED_WARBLER, 1)
		]);
		expect(highlights).toHaveLength(0);
	});

	it('sets current-period flags from the injected today', () => {
		// today during the session period: isCurrentYear and isCurrentSeason both true
		const highlights = deriveSpecies(
			[
				speciesRow(SESSION_DATE, REED_WARBLER, 10),
				speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 5)
			],
			new Date('2024-10-20')
		);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				speciesName: REED_WARBLER,
				isCurrentYear: true,
				isCurrentSeason: true
			})
		);
	});

	describe('all-time 2nd/3rd placements', () => {
		it('reports a strict 2nd-best day when the session count falls between the two best prior values', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SPRING_YEAR_ONE, REED_WARBLER, 5)
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({
				type: 'species-count-record',
				speciesName: REED_WARBLER,
				scope: 'all-time',
				value: 8,
				placementRank: 2,
				isJointPlacement: false
			});
		});

		it('reports a strict 3rd-best day when the session count falls between the 2nd and 3rd prior values', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 5),
				speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SPRING_YEAR_ONE, REED_WARBLER, 8),
				speciesRow(PRIOR_SPRING_YEAR_THREE, REED_WARBLER, 3)
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({
				placementRank: 3,
				isJointPlacement: false
			});
		});

		it('reports a joint 2nd-best day with no age gate when the session ties a recent 2nd-best value', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_THIS_SEASON, REED_WARBLER, 8) // < 1 month old
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({
				scope: 'all-time',
				placementRank: 2,
				isJointPlacement: true
			});
		});

		it('reports a joint 3rd-best day when the session ties the 3rd-best value', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 5),
				speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SPRING_YEAR_ONE, REED_WARBLER, 8),
				speciesRow(PRIOR_SPRING_YEAR_THREE, REED_WARBLER, 5)
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({
				placementRank: 3,
				isJointPlacement: true
			});
		});

		it('reports both an all-time placement and a narrower-scope record for the same species', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_THIS_SEASON, REED_WARBLER, 3)
			]);
			expect(highlights).toHaveLength(2);
			expect(highlights).toContainEqual(
				expect.objectContaining({
					scope: 'all-time',
					placementRank: 2,
					isJointPlacement: false
				})
			);
			expect(highlights).toContainEqual(
				expect.objectContaining({ scope: 'any-season', value: 8 })
			);
		});

		it('does not report placements in narrower scopes', () => {
			// three top days block all-time tiers; session beats this year's
			// best but a this-year 2nd place is not a thing
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 20),
				speciesRow(PRIOR_SPRING_YEAR_ONE, REED_WARBLER, 20),
				speciesRow(PRIOR_SPRING_YEAR_THREE, REED_WARBLER, 20),
				speciesRow(PRIOR_SPRING_THIS_YEAR, REED_WARBLER, 10)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('continues to narrower scopes when the session misses every included placement tier', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 20),
				speciesRow(PRIOR_SPRING_YEAR_ONE, REED_WARBLER, 15),
				speciesRow(PRIOR_SPRING_YEAR_THREE, REED_WARBLER, 12),
				speciesRow(PRIOR_THIS_SEASON, REED_WARBLER, 5)
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({ scope: 'any-season', value: 8 });
			expect(highlights[0].placementRank).toBeUndefined();
		});

		it('counts later days when building placement tiers', () => {
			// three later days at the top value block 2nd place
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(LATER_DAY, REED_WARBLER, 10),
				speciesRow(LATER_DAY_TWO, REED_WARBLER, 10),
				speciesRow(LATER_DAY_THREE, REED_WARBLER, 10)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('does not report 2nd place when three prior days share the top value', () => {
			// session would be rank 4
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SPRING_YEAR_ONE, REED_WARBLER, 10),
				speciesRow(PRIOR_SPRING_YEAR_THREE, REED_WARBLER, 10),
				speciesRow(PRIOR_SPRING_YEAR_ONE_LATER, REED_WARBLER, 5)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('does not report 3rd place when the top two tiers already cover three prior days', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 5),
				speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SPRING_YEAR_ONE, REED_WARBLER, 10),
				speciesRow(PRIOR_SPRING_YEAR_THREE, REED_WARBLER, 8),
				speciesRow(PRIOR_SPRING_YEAR_ONE_LATER, REED_WARBLER, 4)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('ranks by prior day count, so tying the 2nd value behind two joint-top days is joint 3rd', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SPRING_YEAR_ONE, REED_WARBLER, 10),
				speciesRow(PRIOR_SPRING_YEAR_THREE, REED_WARBLER, 8)
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({
				placementRank: 3,
				isJointPlacement: true
			});
		});

		it('reports no placement when the session falls below all existing tier values', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 5),
				speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SPRING_YEAR_ONE, REED_WARBLER, 8)
			]);
			expect(highlights).toHaveLength(0);
		});
	});
});

// ---- buildHighlightSentence — species-count-record ----

function makeSpeciesHighlight(
	overrides: Partial<SpeciesCountRecordHighlight>
): SpeciesCountRecordHighlight {
	return {
		type: 'species-count-record',
		speciesName: 'Reed Warbler',
		scope: 'all-time',
		value: 12,
		seasonName: 'autumn',
		year: 2024,
		isCurrentYear: false,
		isCurrentSeason: false,
		seasonPeriodLabel: 'autumn 2024',
		...overrides
	};
}

describe('buildHighlightSentence — species-count-record', () => {
	it('renders all-time copy', () => {
		expect(buildHighlightSentence(makeSpeciesHighlight({}))).toBe(
			'Record day for Reed Warbler — 12 caught, the most ever'
		);
	});

	it('renders any-season copy', () => {
		expect(
			buildHighlightSentence(makeSpeciesHighlight({ scope: 'any-season' }))
		).toBe('Record day for Reed Warbler — 12 caught, the most in any autumn');
	});

	it('renders current-year this-year copy ("this year")', () => {
		expect(
			buildHighlightSentence(
				makeSpeciesHighlight({ scope: 'this-year', isCurrentYear: true })
			)
		).toBe('Record day for Reed Warbler — 12 caught, the most this year');
	});

	it('renders past-year this-year copy ("of 2024")', () => {
		expect(
			buildHighlightSentence(makeSpeciesHighlight({ scope: 'this-year' }))
		).toBe('Record day for Reed Warbler — 12 caught, the most in 2024');
	});

	it('renders current-season this-season copy ("this autumn")', () => {
		expect(
			buildHighlightSentence(
				makeSpeciesHighlight({ scope: 'this-season', isCurrentSeason: true })
			)
		).toBe('Record day for Reed Warbler — 12 caught, the most this autumn');
	});

	it('renders past-period this-season copy ("in autumn 2024")', () => {
		expect(
			buildHighlightSentence(makeSpeciesHighlight({ scope: 'this-season' }))
		).toBe('Record day for Reed Warbler — 12 caught, the most in autumn 2024');
	});

	it('renders past winter copy ("in winter 2023/24")', () => {
		expect(
			buildHighlightSentence(
				makeSpeciesHighlight({
					scope: 'this-season',
					seasonName: 'winter',
					seasonPeriodLabel: 'winter 2023/24'
				})
			)
		).toBe(
			'Record day for Reed Warbler — 12 caught, the most in winter 2023/24'
		);
	});

	it('renders record-equalling for-N-years copy', () => {
		expect(
			buildHighlightSentence(
				makeSpeciesHighlight({ recordEqualledYearsAgo: 2 })
			)
		).toBe(
			'Record-equalling day for Reed Warbler — 12 caught, most for 2 years'
		);
	});

	it('renders joint best placement copy', () => {
		expect(
			buildHighlightSentence(
				makeSpeciesHighlight({ placementRank: 1, isJointPlacement: true })
			)
		).toBe('Joint best day for Reed Warbler ever — 12 birds');
	});

	it('renders 2nd-best placement copy', () => {
		expect(
			buildHighlightSentence(
				makeSpeciesHighlight({
					placementRank: 2,
					isJointPlacement: false,
					value: 8
				})
			)
		).toBe('2nd-best day for Reed Warbler ever — 8 birds');
	});

	it('renders 3rd-best placement copy', () => {
		expect(
			buildHighlightSentence(
				makeSpeciesHighlight({
					placementRank: 3,
					isJointPlacement: false,
					value: 8
				})
			)
		).toBe('3rd-best day for Reed Warbler ever — 8 birds');
	});

	it('renders joint 2nd-best placement copy', () => {
		expect(
			buildHighlightSentence(
				makeSpeciesHighlight({
					placementRank: 2,
					isJointPlacement: true,
					value: 8
				})
			)
		).toBe('Joint 2nd-best day for Reed Warbler ever — 8 birds');
	});

	it('renders joint 3rd-best placement copy', () => {
		expect(
			buildHighlightSentence(
				makeSpeciesHighlight({
					placementRank: 3,
					isJointPlacement: true,
					value: 8
				})
			)
		).toBe('Joint 3rd-best day for Reed Warbler ever — 8 birds');
	});
});

// ---- deriveFirstEverSpecies ----

const FIRECREST = 'Firecrest';

function deriveFirstEver(rows: DaySpeciesMetricRow[], sessionDates?: string[]) {
	const daySpeciesCounts = rows;
	const stats: SessionStatsData = {
		daySpeciesCounts,
		sessionDates: sessionDates ?? [
			...new Set(rows.map((row) => row.visit_date))
		]
	};
	return deriveFirstEverSpecies({ date: SESSION_DATE, stats });
}

describe('deriveFirstEverSpecies', () => {
	it('maps species whose earliest date is the session date to first-ever highlights', () => {
		const highlights = deriveFirstEver([
			speciesRow(SESSION_DATE, FIRECREST, 1),
			speciesRow(SESSION_DATE, REED_WARBLER, 3),
			speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 2)
		]);
		// Firecrest appears for the first time on the session date
		expect(highlights).toContainEqual({
			type: 'first-ever-species',
			speciesName: FIRECREST
		});
		// Reed Warbler was seen before — not first-ever
		expect(highlights.map((h) => h.speciesName)).not.toContain(REED_WARBLER);
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
			speciesRow(PRIOR_SPRING_OTHER_YEAR, REED_WARBLER, 3)
		]);
		expect(highlights).toEqual([]);
	});
});

// ---- buildHighlightSentence — first-ever-species ----

function makeFirstEverHighlight(
	overrides: Partial<FirstEverSpeciesHighlight> = {}
): FirstEverSpeciesHighlight {
	return {
		type: 'first-ever-species',
		speciesName: 'Firecrest',
		...overrides
	};
}

describe('buildHighlightSentence — first-ever-species', () => {
	it('renders first-ever copy', () => {
		expect(buildHighlightSentence(makeFirstEverHighlight())).toBe(
			'First ever Firecrest for the group'
		);
	});
});
