import { describe, it, expect } from 'vitest';
import {
	deriveLongAbsenceRetraps,
	deriveFirstEverSpecies,
	deriveFirstOfYearSpecies,
	deriveRareSpecies,
	deriveSessionTotalRecords,
	deriveSinceHighlights,
	deriveSpeciesRecords,
	deriveWeightRecordBreakers,
	scopedSortValue,
	TRAILING_SORT_VALUES,
	type FirstEverSpeciesHighlight,
	type FirstOfYearSpeciesHighlight,
	type LongAbsenceRetrapHighlight,
	type RareSpeciesHighlight,
	type SessionHighlight,
	type SessionTotalRecordHighlight,
	type SinceComparisonHighlight,
	type SpeciesCountRecordHighlight,
	type WeightRecordHighlight,
	type SessionStatsData
} from '../session-highlights';
import { renderHighlight } from '@/app/components/session-highlight-renderers';
import type {
	StatsPerDayAndSpeciesResult,
	LongAbsenceRetrapsResult
} from '@/app/models/db';

// Overrides for the per-family highlight factories — every field bar the
// fixed `type` discriminant
type HighlightFields<T extends SessionHighlight> = Omit<T, 'type'>;

// Each highlight renders <li key={sentence}>{sentence}</li>; the copy tests
// assert on the sentence text
function renderedText(highlight: SessionHighlight): string {
	return (renderHighlight(highlight).props as { children: string }).children;
}

const SESSION_DATE = '2024-09-15'; // autumn
// A fixed "today" after the session's year and season, so current-period
// flags are deterministically false unless a test passes its own today
const PAST_PERIOD_TODAY = new Date('2025-06-01');

// Comparison days used across tests, chosen for their scope membership
// relative to SESSION_DATE:
const PRIOR_AUTUMN_OTHER_YEAR = '2021-09-10'; // any-season only (3+ years ago)
const PRIOR_SUMMER_OTHER_YEAR = '2022-05-01'; // all-time only
const PRIOR_SUMMER_THIS_YEAR = '2024-05-01'; // this-year (and all-time)
const PRIOR_THIS_SEASON = '2024-08-20'; // this-season (and all narrower)
const LATER_DAY = '2024-10-01'; // after the session, but in every scope
const LATER_DAY_TWO = '2024-10-05';
const LATER_DAY_THREE = '2024-10-20';
// Additional all-time-only days for multi-day placement-tier scenarios
const PRIOR_SUMMER_YEAR_ONE = '2021-05-01';
const PRIOR_SUMMER_YEAR_ONE_LATER = '2021-05-15';
const PRIOR_SUMMER_YEAR_THREE = '2023-05-01';

function dayRows(
	date: string,
	speciesCounts: Record<string, number>
): StatsPerDayAndSpeciesResult[] {
	return Object.entries(speciesCounts).map(
		([species_name, encounter_count]) => ({
			species_name,
			visit_date: date,
			encounter_count,
			weighed_birds_count: 0,
			min_weight: 0,
			max_weight: 0
		})
	);
}

function statsFor(results: StatsPerDayAndSpeciesResult[]): SessionStatsData {
	return {
		daySpeciesStats: results,
		sessionDates: [...new Set(results.map((row) => row.visit_date))]
	};
}

function derive(
	results: StatsPerDayAndSpeciesResult[],
	today = PAST_PERIOD_TODAY
) {
	return deriveSessionTotalRecords({
		date: SESSION_DATE,
		stats: statsFor(results),
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
			sortValue: scopedSortValue('all-time', 3),
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

	it('reports only all-time when all scopes are records', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_AUTUMN_OTHER_YEAR, { Robin: 60 }),
			...dayRows(PRIOR_SUMMER_THIS_YEAR, { Robin: 50 }),
			...dayRows(PRIOR_THIS_SEASON, { Robin: 40 })
		]);
		const encounterRecords = highlights.filter(
			(highlight) => highlight.metric === 'encounters'
		);
		expect(encounterRecords.length).toBe(1);
		expect(encounterRecords[0].scope).toBe('all-time');
	});

	it('prefers any-season over this-year and this-year over this-season', () => {
		// all-time beaten by a big summer day, but best autumn day is beaten
		const anySeason = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 100 }),
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
			...dayRows(PRIOR_SUMMER_THIS_YEAR, { Robin: 60 }),
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
			...dayRows(PRIOR_SUMMER_THIS_YEAR, { Robin: 74 })
		]);
		expect(
			highlights.filter((highlight) => highlight.metric === 'encounters')
		).toEqual([]);
	});

	it('ignores ties in narrower scopes', () => {
		// all-time beaten, any-season tied — the tie is not reportable there
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 100 }),
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
				...dayRows(PRIOR_SUMMER_OTHER_YEAR, { Robin: 60 })
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

// ---- deriveSinceHighlights ----

// A day within a month of SESSION_DATE (2024-09-15) — since dates this recent
// are not editorial-worthy
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
				sortValue: TRAILING_SORT_VALUES['since-comparison'],
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
			sortValue: TRAILING_SORT_VALUES['since-comparison'],
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
				sortValue: TRAILING_SORT_VALUES['since-comparison'],
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
			sortValue: TRAILING_SORT_VALUES['since-comparison'],
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
				sortValue: TRAILING_SORT_VALUES['since-comparison'],
				kind: 'busiest',
				value: 20,
				sinceDate: PRIOR_SUMMER_OTHER_YEAR
			}
		]);
	});
});

function makeHighlight(
	overrides: Partial<HighlightFields<SessionTotalRecordHighlight>>
): SessionTotalRecordHighlight {
	const fields = {
		metric: 'encounters' as const,
		scope: 'all-time' as const,
		value: 74,
		seasonName: 'autumn',
		year: 2024,
		isCurrentYear: false,
		isCurrentSeason: false,
		seasonPeriodLabel: 'autumn 2024',
		...overrides
	};
	return {
		type: 'session-total-record',
		sortValue: scopedSortValue(
			fields.scope,
			fields.metric === 'encounters' ? 3 : 2
		),
		...fields
	};
}

describe('render — element shape', () => {
	it('renders a list item keyed by the sentence', () => {
		const element = renderHighlight(makeHighlight({}));
		expect(element.type).toBe('li');
		expect(element.key).toBe('Busiest session ever — 74 birds');
	});
});

describe('render — session-total-record', () => {
	it('renders all-time busiest copy', () => {
		expect(renderedText(makeHighlight({}))).toBe(
			'Busiest session ever — 74 birds'
		);
	});

	it('renders any-season busiest copy', () => {
		expect(renderedText(makeHighlight({ scope: 'any-season' }))).toBe(
			'Busiest autumn session ever — 74 birds'
		);
	});

	it('renders this-year busiest copy as "this year" for a current-year session', () => {
		expect(
			renderedText(makeHighlight({ scope: 'this-year', isCurrentYear: true }))
		).toBe('Busiest session this year — 74 birds');
	});

	it('renders this-year busiest copy with the year for a past session', () => {
		expect(renderedText(makeHighlight({ scope: 'this-year' }))).toBe(
			'Busiest session of 2024 — 74 birds'
		);
	});

	it('renders this-season busiest copy as "this <season>" for a current-season session', () => {
		expect(
			renderedText(
				makeHighlight({ scope: 'this-season', isCurrentSeason: true })
			)
		).toBe('Busiest session this autumn — 74 birds');
	});

	it('renders this-season busiest copy with the season period for a past session', () => {
		expect(renderedText(makeHighlight({ scope: 'this-season' }))).toBe(
			'Busiest session in autumn 2024 — 74 birds'
		);
	});

	it('renders past winter copy with the split-year label', () => {
		expect(
			renderedText(
				makeHighlight({
					scope: 'this-season',
					seasonName: 'winter',
					seasonPeriodLabel: 'winter 2023/24'
				})
			)
		).toBe('Busiest session in winter 2023/24 — 74 birds');
	});

	it('renders most-varied copy for the species metric', () => {
		expect(renderedText(makeHighlight({ metric: 'species', value: 18 }))).toBe(
			'Most varied session ever — 18 species'
		);
	});

	it('renders busiest-for-N-years copy for an all-time tie', () => {
		expect(renderedText(makeHighlight({ recordEqualledYearsAgo: 3 }))).toBe(
			'Busiest session for 3 years — 74 birds'
		);
	});
});

// ---- deriveSpeciesRecords ----

const REED_WARBLER = 'Reed Warbler';
const ROBIN = 'Robin';

function speciesRow(
	date: string,
	species: string,
	count: number
): StatsPerDayAndSpeciesResult {
	return {
		visit_date: date,
		species_name: species,
		encounter_count: count,
		weighed_birds_count: 0,
		min_weight: 0,
		max_weight: 0
	};
}

function statsForSpecies(
	results: StatsPerDayAndSpeciesResult[]
): SessionStatsData {
	return {
		daySpeciesStats: results,
		sessionDates: [...new Set(results.map((row) => row.visit_date))]
	};
}

function deriveSpecies(
	results: StatsPerDayAndSpeciesResult[],
	today = PAST_PERIOD_TODAY
) {
	return deriveSpeciesRecords({
		date: SESSION_DATE,
		stats: statsForSpecies(results),
		today
	});
}

describe('deriveSpeciesRecords', () => {
	it('reports the broadest scope achieved per species', () => {
		// All-time beaten: prior autumn (any-season) had 5, but a summer day also had 5
		// Session has 10, so it beats all-time
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_AUTUMN_OTHER_YEAR, REED_WARBLER, 5),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 5)
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
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 5),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 3)
		]);
		const speciesNames = highlights.map((h) => h.speciesName);
		expect(speciesNames).toContain(REED_WARBLER);
		expect(speciesNames).toContain(ROBIN);
	});

	it('requires the species to appear on another day in scope', () => {
		// Reed Warbler only appears on the session day — no other day, no record
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, ROBIN, 3)
		]);
		expect(highlights.map((h) => h.speciesName)).not.toContain(REED_WARBLER);
	});

	it('demotes the session to a placement when a later day has a higher count', () => {
		const highlights = deriveSpecies([
			speciesRow(SESSION_DATE, REED_WARBLER, 10),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 5),
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
			speciesRow(PRIOR_SUMMER_THIS_YEAR, REED_WARBLER, 10) // 2024-05-01 — < 1 year
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
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 20),
			speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 20),
			speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 20),
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
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 5)
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
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 5)
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
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 3)
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
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_THIS_SEASON, REED_WARBLER, 8) // < 1 month old
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({
				scope: 'all-time',
				placementRank: 2,
				isJointPlacement: true
			});
		});

		it('does not report a joint 3rd-best day when the session ties the 3rd-best value', () => {
			// A joint 3rd merely repeats an already-lesser record — suppressed
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 5),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 5)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('reports a joint 2nd-best day even when many other days share the tied value', () => {
			// Ties for 2nd stay notable however many days hold the value — only
			// the top value's day count gates whether 2nd place is reported
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 8),
				speciesRow(PRIOR_THIS_SEASON, REED_WARBLER, 8)
			]);
			expect(highlights).toHaveLength(1);
			expect(highlights[0]).toMatchObject({
				scope: 'all-time',
				placementRank: 2,
				isJointPlacement: true
			});
		});

		it('reports both an all-time placement and a narrower-scope record for the same species', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
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
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 20),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 20),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 20),
				speciesRow(PRIOR_SUMMER_THIS_YEAR, REED_WARBLER, 10)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('continues to narrower scopes when the session misses every included placement tier', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 20),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 15),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 12),
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
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE_LATER, REED_WARBLER, 5)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('does not report 3rd place when the top two tiers already cover three prior days', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 5),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_YEAR_ONE_LATER, REED_WARBLER, 4)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('suppresses a joint 3rd when tying the 2nd value behind two joint-top days', () => {
			// Two joint-top days rank the session 3rd, and it ties another day at
			// that value — a joint 3rd, so it is suppressed
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 8),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_THREE, REED_WARBLER, 8)
			]);
			expect(highlights).toHaveLength(0);
		});

		it('reports no placement when the session falls below all existing tier values', () => {
			const highlights = deriveSpecies([
				speciesRow(SESSION_DATE, REED_WARBLER, 5),
				speciesRow(PRIOR_SUMMER_OTHER_YEAR, REED_WARBLER, 10),
				speciesRow(PRIOR_SUMMER_YEAR_ONE, REED_WARBLER, 8)
			]);
			expect(highlights).toHaveLength(0);
		});
	});
});

// ---- render — species-count-record ----

function makeSpeciesHighlight(
	overrides: Partial<HighlightFields<SpeciesCountRecordHighlight>>
): SpeciesCountRecordHighlight {
	const fields = {
		speciesName: 'Reed Warbler',
		scope: 'all-time' as const,
		value: 12,
		seasonName: 'autumn',
		year: 2024,
		isCurrentYear: false,
		isCurrentSeason: false,
		seasonPeriodLabel: 'autumn 2024',
		...overrides
	};
	return {
		type: 'species-count-record',
		sortValue: scopedSortValue(fields.scope, 1),
		...fields
	};
}

describe('render — species-count-record', () => {
	it('renders all-time copy', () => {
		expect(renderedText(makeSpeciesHighlight({}))).toBe(
			'Record day for Reed Warbler — 12 caught, the most ever'
		);
	});

	it('renders any-season copy', () => {
		expect(renderedText(makeSpeciesHighlight({ scope: 'any-season' }))).toBe(
			'Record day for Reed Warbler — 12 caught, the most in any autumn'
		);
	});

	it('renders current-year this-year copy ("this year")', () => {
		expect(
			renderedText(
				makeSpeciesHighlight({ scope: 'this-year', isCurrentYear: true })
			)
		).toBe('Record day for Reed Warbler — 12 caught, the most this year');
	});

	it('renders past-year this-year copy ("of 2024")', () => {
		expect(renderedText(makeSpeciesHighlight({ scope: 'this-year' }))).toBe(
			'Record day for Reed Warbler — 12 caught, the most in 2024'
		);
	});

	it('renders current-season this-season copy ("this autumn")', () => {
		expect(
			renderedText(
				makeSpeciesHighlight({ scope: 'this-season', isCurrentSeason: true })
			)
		).toBe('Record day for Reed Warbler — 12 caught, the most this autumn');
	});

	it('renders past-period this-season copy ("in autumn 2024")', () => {
		expect(renderedText(makeSpeciesHighlight({ scope: 'this-season' }))).toBe(
			'Record day for Reed Warbler — 12 caught, the most in autumn 2024'
		);
	});

	it('renders past winter copy ("in winter 2023/24")', () => {
		expect(
			renderedText(
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
			renderedText(makeSpeciesHighlight({ recordEqualledYearsAgo: 2 }))
		).toBe(
			'Record-equalling day for Reed Warbler — 12 caught, most for 2 years'
		);
	});

	it('renders joint best placement copy', () => {
		expect(
			renderedText(
				makeSpeciesHighlight({ placementRank: 1, isJointPlacement: true })
			)
		).toBe('Joint best day for Reed Warbler ever — 12 birds');
	});

	it('renders second-best placement copy', () => {
		expect(
			renderedText(
				makeSpeciesHighlight({
					placementRank: 2,
					isJointPlacement: false,
					value: 8
				})
			)
		).toBe('Second best day for Reed Warbler ever — 8 birds');
	});

	it('renders third-best placement copy', () => {
		expect(
			renderedText(
				makeSpeciesHighlight({
					placementRank: 3,
					isJointPlacement: false,
					value: 8
				})
			)
		).toBe('Third best day for Reed Warbler ever — 8 birds');
	});

	it('renders joint second-best placement copy', () => {
		expect(
			renderedText(
				makeSpeciesHighlight({
					placementRank: 2,
					isJointPlacement: true,
					value: 8
				})
			)
		).toBe('Joint second best day for Reed Warbler ever — 8 birds');
	});
});

// ---- deriveFirstEverSpecies ----

const FIRECREST = 'Firecrest';

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
			sortValue: TRAILING_SORT_VALUES['first-ever-species'],
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
				sortValue: TRAILING_SORT_VALUES['first-ever-species'],
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
				sortValue: TRAILING_SORT_VALUES['first-ever-species'],
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

// ---- deriveFirstOfYearSpecies ----

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
				sortValue: TRAILING_SORT_VALUES['first-of-year-species'],
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
				sortValue: TRAILING_SORT_VALUES['first-of-year-species'],
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
				sortValue: TRAILING_SORT_VALUES['first-of-year-species'],
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

	it("returns empty for the group's first session of the year", () => {
		// Prior sessions exist, but none this year — every species would be
		// first of the year, so suppress all
		const highlights = deriveFirstOfYear([
			speciesRow(SESSION_DATE, FIRECREST, 1),
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, FIRECREST, 2)
		]);
		expect(highlights).toEqual([]);
	});

	it('returns empty when every species was already seen this year', () => {
		const highlights = deriveFirstOfYear([
			speciesRow(SESSION_DATE, REED_WARBLER, 5),
			speciesRow(PRIOR_SUMMER_THIS_YEAR, REED_WARBLER, 3)
		]);
		expect(highlights).toEqual([]);
	});
});

// ---- deriveRareSpecies ----

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
				sortValue: TRAILING_SORT_VALUES['rare-species'],
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
				sortValue: TRAILING_SORT_VALUES['rare-species'],
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

// ---- render — rare-species ----

function makeRareSpeciesHighlight(
	overrides: Partial<HighlightFields<RareSpeciesHighlight>> = {}
): RareSpeciesHighlight {
	return {
		type: 'rare-species',
		sortValue: TRAILING_SORT_VALUES['rare-species'],
		speciesName: FIRECREST,
		totalSessionDays: 2,
		...overrides
	};
}

describe('render — rare-species', () => {
	it('renders the total session-day count', () => {
		expect(renderedText(makeRareSpeciesHighlight())).toBe(
			'Rarely recorded — Firecrest seen on only 2 days ever'
		);
	});

	it('renders a three-day count', () => {
		expect(
			renderedText(makeRareSpeciesHighlight({ totalSessionDays: 3 }))
		).toBe('Rarely recorded — Firecrest seen on only 3 days ever');
	});
});

// ---- render — first-ever-species ----

function makeFirstEverHighlight(
	overrides: Partial<HighlightFields<FirstEverSpeciesHighlight>> = {}
): FirstEverSpeciesHighlight {
	return {
		type: 'first-ever-species',
		sortValue: TRAILING_SORT_VALUES['first-ever-species'],
		speciesName: 'Firecrest',
		multipleIndividualsRecorded: false,
		isOnlyRecord: false,
		...overrides
	};
}

describe('render — first-ever-species', () => {
	it('renders first-ever copy', () => {
		expect(renderedText(makeFirstEverHighlight())).toBe(
			'First ever Firecrest record'
		);
	});

	it('renders plural first-ever copy for multiple individuals', () => {
		expect(
			renderedText(
				makeFirstEverHighlight({ multipleIndividualsRecorded: true })
			)
		).toBe('First ever Firecrest records');
	});

	it('renders only-record copy when the session holds the only record', () => {
		expect(renderedText(makeFirstEverHighlight({ isOnlyRecord: true }))).toBe(
			'Only Firecrest record ever'
		);
	});

	it('renders plural only-record copy for multiple individuals', () => {
		expect(
			renderedText(
				makeFirstEverHighlight({
					isOnlyRecord: true,
					multipleIndividualsRecorded: true
				})
			)
		).toBe('Only Firecrest records ever');
	});
});

// ---- render — first-of-year-species ----

function makeFirstOfYearHighlight(
	overrides: Partial<HighlightFields<FirstOfYearSpeciesHighlight>> = {}
): FirstOfYearSpeciesHighlight {
	return {
		type: 'first-of-year-species',
		sortValue: TRAILING_SORT_VALUES['first-of-year-species'],
		speciesName: 'Firecrest',
		year: 2024,
		isCurrentYear: false,
		multipleIndividualsRecorded: false,
		isOnlyRecord: false,
		...overrides
	};
}

describe('render — first-of-year-species', () => {
	it('renders "of the year" copy while the session year is current', () => {
		expect(
			renderedText(makeFirstOfYearHighlight({ isCurrentYear: true }))
		).toBe('First Firecrest record of the year');
	});

	it('renders the absolute year once the session year has passed', () => {
		expect(renderedText(makeFirstOfYearHighlight())).toBe(
			'First Firecrest record of 2024'
		);
	});

	it('renders plural first-of-year copy for multiple individuals', () => {
		expect(
			renderedText(
				makeFirstOfYearHighlight({ multipleIndividualsRecorded: true })
			)
		).toBe('First Firecrest records of 2024');
	});

	it('renders only-record copy while the session year is current', () => {
		expect(
			renderedText(
				makeFirstOfYearHighlight({ isCurrentYear: true, isOnlyRecord: true })
			)
		).toBe('Only Firecrest record of the year');
	});

	it('renders plural only-record copy once the session year has passed', () => {
		expect(
			renderedText(
				makeFirstOfYearHighlight({
					isOnlyRecord: true,
					multipleIndividualsRecorded: true
				})
			)
		).toBe('Only Firecrest records of 2024');
	});
});

// ---- deriveLongAbsenceRetraps ----

function makeLongAbsenceRetrapResult(
	overrides: Partial<LongAbsenceRetrapsResult> = {}
): LongAbsenceRetrapsResult {
	return {
		ring_no: 'ARRETRAP',
		species_name: 'Robin',
		previous_date: '2021-06-20',
		gap_days: 1000,
		...overrides
	};
}

describe('deriveLongAbsenceRetraps', () => {
	it('maps rows to highlights preserving gap-descending order', () => {
		const results: LongAbsenceRetrapsResult[] = [
			makeLongAbsenceRetrapResult({
				ring_no: 'AAA111',
				species_name: 'Robin',
				previous_date: '2020-01-01',
				gap_days: 1500
			}),
			makeLongAbsenceRetrapResult({
				ring_no: 'BBB222',
				species_name: 'Wren',
				previous_date: '2021-06-20',
				gap_days: 1000
			})
		];
		const highlights = deriveLongAbsenceRetraps(results, '2024-03-15');
		expect(highlights).toHaveLength(2);
		expect(highlights[0]).toMatchObject({
			type: 'long-absence-retrap',
			ringNo: 'AAA111',
			speciesName: 'Robin',
			previousDate: '2020-01-01'
		});
		expect(highlights[1]).toMatchObject({
			type: 'long-absence-retrap',
			ringNo: 'BBB222',
			speciesName: 'Wren',
			previousDate: '2021-06-20'
		});
	});
});

// ---- render — long-absence-retrap ----

function makeLongAbsenceHighlight(
	overrides: Partial<HighlightFields<LongAbsenceRetrapHighlight>> = {}
): LongAbsenceRetrapHighlight {
	return {
		type: 'long-absence-retrap',
		sortValue: TRAILING_SORT_VALUES['long-absence-retrap'],
		ringNo: 'ARRETRAP',
		speciesName: 'Robin',
		previousDate: '2021-06-20',
		gapYears: 2,
		gapMonths: 10,
		...overrides
	};
}

describe('render — long-absence-retrap', () => {
	it('formats the gap as years and months with the previous date', () => {
		expect(renderedText(makeLongAbsenceHighlight())).toBe(
			'Robin ARRETRAP recaught after 2 years, 10 months away (last seen 20 Jun 2021)'
		);
	});

	it('formats a whole-year gap without a months clause', () => {
		expect(
			renderedText(makeLongAbsenceHighlight({ gapYears: 3, gapMonths: 0 }))
		).toBe(
			'Robin ARRETRAP recaught after 3 years away (last seen 20 Jun 2021)'
		);
	});
});

// ---- deriveWeightRecordBreakers ----

const BLUE_TIT = 'Blue Tit';

function weightRow(
	date: string,
	species: string,
	{
		weighedBirds = 1,
		minWeight,
		maxWeight
	}: { weighedBirds?: number; minWeight: number; maxWeight: number }
): StatsPerDayAndSpeciesResult {
	return {
		visit_date: date,
		species_name: species,
		encounter_count: weighedBirds,
		weighed_birds_count: weighedBirds,
		min_weight: minWeight,
		max_weight: maxWeight
	};
}

function deriveWeights(results: StatsPerDayAndSpeciesResult[]) {
	return deriveWeightRecordBreakers({
		date: SESSION_DATE,
		stats: statsFor(results)
	});
}

describe('deriveWeightRecordBreakers', () => {
	it('ranks the heaviest bird 1st when its max beats every other day', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 13.0
			})
		]);
		expect(highlights).toContainEqual({
			type: 'weight-record',
			sortValue: TRAILING_SORT_VALUES['weight-record'],
			speciesName: BLUE_TIT,
			extreme: 'heaviest',
			weight: 13.1,
			placementRank: 1,
			isJointPlacement: false
		});
	});

	it('ranks the lightest bird 1st when its min beats every other day', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 9.8, maxWeight: 12 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.2,
				maxWeight: 13.0
			})
		]);
		expect(highlights).toContainEqual({
			type: 'weight-record',
			sortValue: TRAILING_SORT_VALUES['weight-record'],
			speciesName: BLUE_TIT,
			extreme: 'lightest',
			weight: 9.8,
			placementRank: 1,
			isJointPlacement: false
		});
	});

	it('reports a 2nd-heaviest placement when one other day is heavier', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 12.5
			}),
			weightRow(LATER_DAY, BLUE_TIT, { minWeight: 10.9, maxWeight: 14.0 })
		]);
		expect(highlights).toContainEqual({
			type: 'weight-record',
			sortValue: TRAILING_SORT_VALUES['weight-record'],
			speciesName: BLUE_TIT,
			extreme: 'heaviest',
			weight: 13.1,
			placementRank: 2,
			isJointPlacement: false
		});
	});

	it('reports a 3rd-heaviest placement when two other days are heavier', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 14.0
			}),
			weightRow(LATER_DAY, BLUE_TIT, { minWeight: 10.9, maxWeight: 13.5 })
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				extreme: 'heaviest',
				weight: 13.1,
				placementRank: 3,
				isJointPlacement: false
			})
		);
	});

	it('does not report a placement beyond the top 3', () => {
		// three other days are heavier, so the session ranks 4th
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 14.0
			}),
			weightRow(LATER_DAY, BLUE_TIT, { minWeight: 10.9, maxWeight: 13.8 }),
			weightRow(LATER_DAY_TWO, BLUE_TIT, { minWeight: 10.8, maxWeight: 13.5 })
		]);
		expect(highlights.map((h) => h.extreme)).not.toContain('heaviest');
	});

	it('flags a joint placement when another day matches the extreme exactly', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_AUTUMN_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 13.1
			})
		]);
		expect(highlights).toContainEqual({
			type: 'weight-record',
			sortValue: TRAILING_SORT_VALUES['weight-record'],
			speciesName: BLUE_TIT,
			extreme: 'heaviest',
			weight: 13.1,
			placementRank: 1,
			isJointPlacement: true
		});
	});

	it('suppresses a joint 3rd placement when two days are heavier and another ties', () => {
		// Two heavier days rank the session 3rd, and a fourth day matches its
		// weight — a joint 3rd, which repeats a lesser record and is suppressed
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 14.0
			}),
			weightRow(LATER_DAY, BLUE_TIT, { minWeight: 10.9, maxWeight: 13.8 }),
			weightRow(LATER_DAY_TWO, BLUE_TIT, { minWeight: 10.8, maxWeight: 13.1 })
		]);
		expect(highlights.map((highlight) => highlight.extreme)).not.toContain(
			'heaviest'
		);
	});

	it('counts later days when ranking placements', () => {
		// the later day is heavier, demoting the session to 2nd
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 12.0
			}),
			weightRow(LATER_DAY, BLUE_TIT, { minWeight: 11.5, maxWeight: 13.5 })
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({ extreme: 'heaviest', placementRank: 2 })
		);
	});

	it('requires at least 3 weighed encounters on other days', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, { minWeight: 11, maxWeight: 13.1 }),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 2,
				minWeight: 10.5,
				maxWeight: 13.0
			})
		]);
		expect(highlights).toEqual([]);
	});

	it('ignores species with no weighed encounter in the session', () => {
		const highlights = deriveWeights([
			weightRow(SESSION_DATE, BLUE_TIT, {
				weighedBirds: 0,
				minWeight: 0,
				maxWeight: 0
			}),
			weightRow(PRIOR_SUMMER_OTHER_YEAR, BLUE_TIT, {
				weighedBirds: 3,
				minWeight: 10.5,
				maxWeight: 13.0
			})
		]);
		expect(highlights).toEqual([]);
	});
});

// ---- render — weight-record ----

function makeWeightHighlight(
	overrides: Partial<HighlightFields<WeightRecordHighlight>> = {}
): WeightRecordHighlight {
	return {
		type: 'weight-record',
		sortValue: TRAILING_SORT_VALUES['weight-record'],
		speciesName: BLUE_TIT,
		extreme: 'heaviest',
		weight: 13.1,
		placementRank: 1,
		isJointPlacement: false,
		...overrides
	};
}

describe('render — weight-record', () => {
	it('renders heaviest-ever copy for a 1st placement', () => {
		expect(renderedText(makeWeightHighlight())).toBe(
			'Heaviest Blue Tit ever weighed — 13.1g'
		);
	});

	it('renders lightest-ever copy for a 1st placement', () => {
		expect(
			renderedText(makeWeightHighlight({ extreme: 'lightest', weight: 9.8 }))
		).toBe('Lightest Blue Tit ever weighed — 9.8g');
	});

	it('renders 2nd-heaviest copy', () => {
		expect(
			renderedText(makeWeightHighlight({ placementRank: 2, weight: 12.9 }))
		).toBe('2nd-heaviest Blue Tit ever weighed — 12.9g');
	});

	it('renders 3rd-lightest copy', () => {
		expect(
			renderedText(
				makeWeightHighlight({
					extreme: 'lightest',
					placementRank: 3,
					weight: 10.4
				})
			)
		).toBe('3rd-lightest Blue Tit ever weighed — 10.4g');
	});

	it('renders joint heaviest copy for a 1st-place tie', () => {
		expect(renderedText(makeWeightHighlight({ isJointPlacement: true }))).toBe(
			'Joint heaviest Blue Tit ever weighed — 13.1g'
		);
	});

	it('renders joint 2nd-heaviest copy', () => {
		expect(
			renderedText(
				makeWeightHighlight({
					placementRank: 2,
					isJointPlacement: true,
					weight: 12.9
				})
			)
		).toBe('Joint 2nd-heaviest Blue Tit ever weighed — 12.9g');
	});
});

// ---- render — since ----

function makeSinceHighlight(
	overrides: Partial<HighlightFields<SinceComparisonHighlight>> = {}
): SinceComparisonHighlight {
	return {
		type: 'since-comparison',
		sortValue: TRAILING_SORT_VALUES['since-comparison'],
		kind: 'busiest',
		value: 41,
		sinceDate: '2023-05-12',
		...overrides
	};
}

describe('render — since', () => {
	it('renders busiest-since copy', () => {
		expect(renderedText(makeSinceHighlight())).toBe(
			'Busiest session since 12 May 2023 — 41 birds'
		);
	});

	it('renders quietest-since copy', () => {
		expect(
			renderedText(
				makeSinceHighlight({
					kind: 'quietest',
					value: 3,
					sinceDate: '2023-09-14'
				})
			)
		).toBe('Quietest session since 14 Sep 2023 — 3 birds');
	});

	it('renders quietest-ever copy', () => {
		expect(
			renderedText(
				makeSinceHighlight({ kind: 'quietest', value: 3, sinceDate: undefined })
			)
		).toBe('Quietest session ever — 3 birds');
	});
});

// The type-priority ordering previously tested here (sortHighlights) now
// lives in the highlight machine — see highlight-refinement-machine.test.ts

// The combine passes that produce these highlights live in the highlight
// machine; here we only test that each combined variant renders its copy.
describe('render — combined-session-total-record', () => {
	const combinedFields = {
		type: 'combined-session-total-record' as const,
		// render tests don't depend on ordering; a placeholder value suffices
		sortValue: 0,
		encounterValue: 120,
		speciesValue: 15,
		seasonName: 'summer',
		year: 2026,
		isCurrentYear: true,
		isCurrentSeason: true,
		seasonPeriodLabel: 'summer 2026'
	};

	it('renders this-year copy for a current-year session', () => {
		expect(renderedText({ ...combinedFields, scope: 'this-year' })).toBe(
			'Busiest and most varied session this year — 120 birds from 15 species'
		);
	});

	it('renders all-time copy', () => {
		expect(renderedText({ ...combinedFields, scope: 'all-time' })).toBe(
			'Busiest and most varied session ever — 120 birds from 15 species'
		);
	});

	it('renders any-season copy with the season name', () => {
		expect(renderedText({ ...combinedFields, scope: 'any-season' })).toBe(
			'Busiest and most varied summer session ever — 120 birds from 15 species'
		);
	});
});

describe('render — combined-only-of-year', () => {
	it('renders three species with commas and a trailing "and"', () => {
		expect(
			renderedText({
				type: 'combined-only-of-year',
				sortValue: 0,
				speciesNames: ['Chaffinch', 'Goldfinch', 'Lesser Whitethroat'],
				year: 2026,
				isCurrentYear: true
			})
		).toBe(
			'Only Chaffinch, Goldfinch and Lesser Whitethroat records of the year'
		);
	});

	it('renders two species joined by "and"', () => {
		expect(
			renderedText({
				type: 'combined-only-of-year',
				sortValue: 0,
				speciesNames: ['Chaffinch', 'Goldfinch'],
				year: 2026,
				isCurrentYear: true
			})
		).toBe('Only Chaffinch and Goldfinch records of the year');
	});

	it('renders the absolute year for a past-year session', () => {
		expect(
			renderedText({
				type: 'combined-only-of-year',
				sortValue: 0,
				speciesNames: ['Chaffinch', 'Goldfinch'],
				year: 2024,
				isCurrentYear: false
			})
		).toBe('Only Chaffinch and Goldfinch records of 2024');
	});
});

describe('render — combined-species-count-record', () => {
	const combinedFields = {
		type: 'combined-species-count-record' as const,
		sortValue: 0,
		seasonName: 'summer',
		year: 2026,
		isCurrentYear: true,
		isCurrentSeason: true,
		seasonPeriodLabel: 'summer 2026'
	};

	it('renders three this-year species with commas and a trailing "and"', () => {
		expect(
			renderedText({
				...combinedFields,
				scope: 'this-year',
				speciesNames: ["Cetti's Warbler", 'Chiffchaff', 'Whitethroat']
			})
		).toBe(
			"Highest Cetti's Warbler, Chiffchaff and Whitethroat counts of the year"
		);
	});

	it('renders two this-year species joined by "and"', () => {
		expect(
			renderedText({
				...combinedFields,
				scope: 'this-year',
				speciesNames: ['Blue Tit', 'Wren']
			})
		).toBe('Highest Blue Tit and Wren counts of the year');
	});

	it('renders the absolute year for a past-year session', () => {
		expect(
			renderedText({
				...combinedFields,
				scope: 'this-year',
				isCurrentYear: false,
				year: 2024,
				speciesNames: ['Blue Tit', 'Wren']
			})
		).toBe('Highest Blue Tit and Wren counts of 2024');
	});

	it('renders this-season copy for a current-season session', () => {
		expect(
			renderedText({
				...combinedFields,
				scope: 'this-season',
				speciesNames: ['Robin', 'Dunnock']
			})
		).toBe('Highest Robin and Dunnock counts this summer');
	});

	it('renders the absolute season label for a past-season session', () => {
		expect(
			renderedText({
				...combinedFields,
				scope: 'this-season',
				isCurrentSeason: false,
				speciesNames: ['Robin', 'Dunnock']
			})
		).toBe('Highest Robin and Dunnock counts in summer 2026');
	});
});

describe('render — combined-first-ever', () => {
	it('renders three species with commas and a trailing "and"', () => {
		expect(
			renderedText({
				type: 'combined-first-ever',
				sortValue: 0,
				speciesNames: ['Blackbird', 'Blackcap', "Cetti's Warbler"]
			})
		).toBe("First ever Blackbird, Blackcap and Cetti's Warbler records");
	});

	it('renders two species joined by "and"', () => {
		expect(
			renderedText({
				type: 'combined-first-ever',
				sortValue: 0,
				speciesNames: ['Blackbird', 'Blackcap']
			})
		).toBe('First ever Blackbird and Blackcap records');
	});

	it('always reads "records" (plural) regardless of the merged parts', () => {
		// The combined line covers at least two species, so the copy is fixed
		// plural even when each source highlight was singular
		expect(
			renderedText({
				type: 'combined-first-ever',
				sortValue: 0,
				speciesNames: ['Blackbird', 'Blackcap']
			})
		).toMatch(/records$/);
	});
});

describe('render — combined-first-of-year', () => {
	it('renders three species with commas and a trailing "and"', () => {
		expect(
			renderedText({
				type: 'combined-first-of-year',
				sortValue: 0,
				speciesNames: ['Blackbird', 'Blackcap', "Cetti's Warbler"],
				year: 2026,
				isCurrentYear: true
			})
		).toBe("First Blackbird, Blackcap and Cetti's Warbler records of the year");
	});

	it('renders two species joined by "and"', () => {
		expect(
			renderedText({
				type: 'combined-first-of-year',
				sortValue: 0,
				speciesNames: ['Blackbird', 'Blackcap'],
				year: 2026,
				isCurrentYear: true
			})
		).toBe('First Blackbird and Blackcap records of the year');
	});

	it('renders the absolute year for a past-year session', () => {
		expect(
			renderedText({
				type: 'combined-first-of-year',
				sortValue: 0,
				speciesNames: ['Blackbird', 'Blackcap'],
				year: 2024,
				isCurrentYear: false
			})
		).toBe('First Blackbird and Blackcap records of 2024');
	});

	it('always reads "records" (plural) regardless of the merged parts', () => {
		expect(
			renderedText({
				type: 'combined-first-of-year',
				sortValue: 0,
				speciesNames: ['Blackbird', 'Blackcap'],
				year: 2026,
				isCurrentYear: true
			})
		).toMatch(/records of the year$/);
	});
});
