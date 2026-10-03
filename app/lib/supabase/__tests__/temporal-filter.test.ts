import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { PostgrestSingleResponse } from '@supabase/supabase-js';
import { applyTemporalFilter, type TemporalFilter } from '../temporal-filter';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import { makeQueryChain } from '@/app/__tests__/helpers/query-chain';
import type { Database } from '@/types/supabase.types';

// A genuine (never-connected) typed client: `applyTemporalFilter`'s whole job
// is to compose with the real supabase-js builder, so these tests build real
// `Encounters` queries and read back the PostgREST conditions it serialised,
// rather than asserting against a stand-in. No request is ever issued — the
// query is inspected, never awaited.
const supabaseClient = createClient<Database>(
	'http://localhost:54321',
	'test-anon-key'
);

// The `visit_date` conditions the filter put on the wire, e.g.
// `['gte.2024-01-01', 'lte.2024-12-31']`.
function visitDateConditions(filter: TemporalFilter): string[] {
	const query = applyTemporalFilter(
		supabaseClient.from('Encounters').select('id, visit_date'),
		filter
	);
	// eslint-disable-next-line no-restricted-syntax -- `url` is `protected` on PostgrestBuilder, so a direct assertion is rejected; reading the built URL is the only way to see what the real builder serialised.
	return (query as unknown as { url: URL }).url.searchParams.getAll(
		'visit_date'
	);
}

describe('applyTemporalFilter', () => {
	describe('date-range filtering', () => {
		it('applies a `.gte` condition when `fromDate` is set', () => {
			expect(visitDateConditions({ fromDate: '2023-04-01' })).toEqual([
				'gte.2023-04-01'
			]);
		});

		it('applies a `.lte` condition when `toDate` is set', () => {
			expect(visitDateConditions({ toDate: '2023-04-30' })).toEqual([
				'lte.2023-04-30'
			]);
		});

		it('applies no date condition when neither is set', () => {
			expect(visitDateConditions({})).toEqual([]);
		});
	});

	describe('year/month filtering', () => {
		it("applies the year's bounds when only `year` is set", () => {
			expect(visitDateConditions({ year: 2024 })).toEqual([
				'gte.2024-01-01',
				'lte.2024-12-31'
			]);
		});

		it("applies the year-and-month's bounds when both `year` and `month` are set", () => {
			// February 2024 — a leap month, so a wrong month-end shows up here.
			expect(visitDateConditions({ year: 2024, month: 2 })).toEqual([
				'gte.2024-02-01',
				'lte.2024-02-29'
			]);
		});

		it('intersects year/month bounds with explicit `fromDate`/`toDate` when both are set', () => {
			expect(
				visitDateConditions({
					year: 2024,
					fromDate: '2024-06-15',
					toDate: '2025-03-01'
				})
			).toEqual(['gte.2024-06-15', 'lte.2024-12-31']);
		});

		it('throws when `month` is set without a `year`, rather than silently widening to all time', () => {
			expect(() => visitDateConditions({ month: 3 })).toThrow(
				'cannot apply `month` without `year`'
			);
		});
	});

	describe('composing with fetchAllPaginatedRows', () => {
		const PAGE_SIZE = 1000;
		const encounterRows = Array.from({ length: PAGE_SIZE + 3 }, (_, index) => ({
			id: index
		}));

		// The mock chain stands in for the real builder here only because paging
		// needs a query that actually resolves; the filtering assertions above
		// use the real thing.
		type PageableQueryMock = {
			gte(column: string, value: string): PageableQueryMock;
			lte(column: string, value: string): PageableQueryMock;
			range(
				fromRow: number,
				toRow: number
			): PromiseLike<PostgrestSingleResponse<{ id: number }[]>>;
		};

		it('pages through every row, re-applying the filter per page and leaving `.range()` to the caller', async () => {
			const { chain, record } = makeQueryChain((fromRow = 0, toRow = 0) =>
				encounterRows.slice(fromRow, toRow + 1)
			);
			const expectedFilterPerPage = [
				{ column: 'visit_date', operator: 'gte', value: '2024-01-01' },
				{ column: 'visit_date', operator: 'lte', value: '2024-12-31' }
			];

			const rows = await fetchAllPaginatedRows((fromRow, toRow) =>
				applyTemporalFilter(
					// eslint-disable-next-line no-restricted-syntax -- `makeQueryChain`'s chain is a `Record<string, unknown>` bag of mocks, so it has no structural overlap with a typed query builder.
					chain as unknown as PageableQueryMock,
					{ year: 2024 }
				).range(fromRow, toRow)
			);

			expect(rows).toEqual(encounterRows);
			// Two pages fetched, each filtered — and the only `.range()` calls are
			// the ones `fetchAllPaginatedRows` itself made.
			expect(record.filters).toEqual([
				...expectedFilterPerPage,
				...expectedFilterPerPage
			]);
			expect(record.range).toEqual({
				fromRow: PAGE_SIZE,
				toRow: 2 * PAGE_SIZE - 1
			});
		});
	});
});
