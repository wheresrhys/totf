import { describe, it, expect } from 'vitest';
import {
	buildHighlightSentence,
	deriveSessionTotalRecords,
	type SessionStatsData,
	type SessionTotalRecordHighlight
} from '../session-highlights';
import type { DaySpeciesMetricRow } from '@/app/models/db';

const SESSION_DATE = '2024-09-15'; // autumn

// Prior days used across tests, chosen for their scope membership
// relative to SESSION_DATE:
const PRIOR_AUTUMN_OTHER_YEAR = '2021-09-10'; // any-season only (3+ years ago)
const PRIOR_SPRING_OTHER_YEAR = '2022-05-01'; // all-time only
const PRIOR_SPRING_THIS_YEAR = '2024-05-01'; // this-year (and all-time)
const PRIOR_THIS_SEASON = '2024-08-20'; // this-season (and all narrower)
const LATER_DAY = '2024-10-01';

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

function derive(rows: DaySpeciesMetricRow[]) {
	return deriveSessionTotalRecords({
		date: SESSION_DATE,
		stats: statsFor(rows)
	});
}

describe('deriveSessionTotalRecords', () => {
	it('returns a busiest record when the session total beats all prior days in scope', () => {
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
			year: 2024
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

	it('ignores sessions after the session date', () => {
		const highlights = derive([
			...dayRows(SESSION_DATE, { Robin: 74 }),
			...dayRows(PRIOR_SPRING_OTHER_YEAR, { Robin: 60 }),
			...dayRows(LATER_DAY, { Robin: 200, Chiffchaff: 200 })
		]);
		expect(highlights).toContainEqual(
			expect.objectContaining({
				metric: 'encounters',
				scope: 'all-time',
				value: 74
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

	it('suppresses records when no prior session exists in scope', () => {
		// the group's first-ever session would otherwise be a record for everything
		expect(derive(dayRows(SESSION_DATE, { Robin: 74, Chiffchaff: 3 }))).toEqual(
			[]
		);
	});

	it('counts zero-encounter sessions as prior sessions in scope', () => {
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

	it('renders this-year busiest copy', () => {
		expect(buildHighlightSentence(makeHighlight({ scope: 'this-year' }))).toBe(
			'Busiest session of 2024 — 74 birds'
		);
	});

	it('renders this-season busiest copy', () => {
		expect(
			buildHighlightSentence(makeHighlight({ scope: 'this-season' }))
		).toBe('Busiest session this autumn — 74 birds');
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
