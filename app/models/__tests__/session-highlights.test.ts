import { describe, it, expect } from 'vitest';
import {
	RECORD_SCOPES,
	buildHighlightSentence,
	deriveSessionTotalRecords,
	getScopeFilters,
	type RecordScope,
	type ScopedTopPeriods,
	type SessionTotalMetric,
	type SessionTotalRecordHighlight
} from '../session-highlights';
import type { TopPeriodsResult } from '@/app/models/db';

const SESSION_DATE = '2024-09-15'; // autumn
const GROUP_ID = 1;

function findScopeFilters(scope: RecordScope) {
	const scopeFilters = getScopeFilters(new Date(SESSION_DATE), GROUP_ID);
	return scopeFilters.find((scopeFilter) => scopeFilter.scope === scope)!
		.filters;
}

describe('getScopeFilters', () => {
	it('builds all-time filters with only ringing_group_filter', () => {
		expect(findScopeFilters('all-time')).toEqual({
			ringing_group_filter: GROUP_ID
		});
	});

	it('builds this-year filters with year_filter from the session date', () => {
		expect(findScopeFilters('this-year')).toEqual({
			ringing_group_filter: GROUP_ID,
			year_filter: 2024
		});
	});

	it('builds any-season filters with numeric months_filter', () => {
		expect(findScopeFilters('any-season')).toEqual({
			ringing_group_filter: GROUP_ID,
			months_filter: [8, 9, 10]
		});
	});

	it('builds this-season filters with YYYY-MM exact_months_filter', () => {
		expect(findScopeFilters('this-season')).toEqual({
			ringing_group_filter: GROUP_ID,
			exact_months_filter: ['2024-08', '2024-09', '2024-10']
		});
	});
});

function scopedRows(
	rowsByScope: Partial<Record<RecordScope, TopPeriodsResult[]>>
): ScopedTopPeriods[] {
	return RECORD_SCOPES.map((scope) => ({
		scope,
		rows: rowsByScope[scope] ?? []
	}));
}

function deriveForMetrics({
	encounters = {},
	species = {}
}: Partial<
	Record<SessionTotalMetric, Partial<Record<RecordScope, TopPeriodsResult[]>>>
>) {
	return deriveSessionTotalRecords({
		date: SESSION_DATE,
		resultsByMetric: {
			encounters: scopedRows(encounters),
			species: scopedRows(species)
		}
	});
}

const recordRows = (value: number): TopPeriodsResult[] => [
	{ visit_date: SESSION_DATE, metric_value: value },
	{ visit_date: '2022-05-01', metric_value: value - 10 }
];

describe('deriveSessionTotalRecords', () => {
	it('returns a record when the top visit_date equals the session date', () => {
		const highlights = deriveForMetrics({
			encounters: { 'all-time': recordRows(74) }
		});
		expect(highlights).toEqual([
			{
				type: 'session-total-record',
				metric: 'encounters',
				scope: 'all-time',
				value: 74,
				seasonName: 'autumn',
				year: 2024
			}
		]);
	});

	it('returns no record when the top visit_date differs', () => {
		const highlights = deriveForMetrics({
			encounters: {
				'all-time': [
					{ visit_date: '2022-05-01', metric_value: 80 },
					{ visit_date: SESSION_DATE, metric_value: 74 }
				]
			}
		});
		expect(highlights).toEqual([]);
	});

	it('returns no record for empty RPC results', () => {
		const highlights = deriveForMetrics({});
		expect(highlights).toEqual([]);
	});

	it('reports only all-time when all four scopes are records', () => {
		const highlights = deriveForMetrics({
			encounters: {
				'all-time': recordRows(74),
				'any-season': recordRows(74),
				'this-year': recordRows(74),
				'this-season': recordRows(74)
			}
		});
		expect(highlights.length).toBe(1);
		expect(highlights[0].scope).toBe('all-time');
	});

	it('prefers any-season over this-year and this-year over this-season', () => {
		const anySeasonAndNarrower = deriveForMetrics({
			encounters: {
				'any-season': recordRows(74),
				'this-year': recordRows(74),
				'this-season': recordRows(74)
			}
		});
		expect(anySeasonAndNarrower.length).toBe(1);
		expect(anySeasonAndNarrower[0].scope).toBe('any-season');

		const thisYearAndNarrower = deriveForMetrics({
			encounters: {
				'this-year': recordRows(74),
				'this-season': recordRows(74)
			}
		});
		expect(thisYearAndNarrower.length).toBe(1);
		expect(thisYearAndNarrower[0].scope).toBe('this-year');
	});

	it('derives encounters and species records independently', () => {
		const highlights = deriveForMetrics({
			encounters: { 'all-time': recordRows(74) },
			species: { 'this-season': recordRows(18) }
		});
		expect(highlights).toEqual([
			expect.objectContaining({
				metric: 'encounters',
				scope: 'all-time',
				value: 74
			}),
			expect.objectContaining({
				metric: 'species',
				scope: 'this-season',
				value: 18
			})
		]);
	});

	it('reports an all-time tie as a for-N-years record when the tied date is over a year old', () => {
		const highlights = deriveForMetrics({
			encounters: {
				'all-time': [
					{ visit_date: SESSION_DATE, metric_value: 74 },
					{ visit_date: '2021-09-10', metric_value: 74 }
				]
			}
		});
		expect(highlights).toEqual([
			expect.objectContaining({
				metric: 'encounters',
				scope: 'all-time',
				value: 74,
				recordEqualledYearsAgo: 3
			})
		]);
	});

	it('ignores an all-time tie under a year old', () => {
		const highlights = deriveForMetrics({
			encounters: {
				'all-time': [
					{ visit_date: SESSION_DATE, metric_value: 74 },
					{ visit_date: '2024-05-01', metric_value: 74 }
				]
			}
		});
		expect(highlights).toEqual([]);
	});

	it('ignores ties in non-all-time scopes', () => {
		const highlights = deriveForMetrics({
			encounters: {
				'any-season': [
					{ visit_date: SESSION_DATE, metric_value: 74 },
					{ visit_date: '2021-09-10', metric_value: 74 }
				]
			}
		});
		expect(highlights).toEqual([]);
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
