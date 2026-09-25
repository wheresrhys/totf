import { vi } from 'vitest';

export type FilterCall = { column: string; operator: string; value: unknown };

/**
 * A chainable Supabase query-builder mock (`.select()`/`.eq()`/`.contains()`/
 * `.order()`/`.range()`/`.limit()`/`.filter()`, each returning the same chain
 * so calls compose in any order/number the real PostgrestFilterBuilder
 * allows) that resolves (thenable, like the real builder) to `{ data, error:
 * null }`.
 *
 * `rows` is either the static data to resolve with (matches every call,
 * e.g. `fetchPageOfBirds`' single non-paginated query), or a
 * `(fromRow?, toRow?) => data` function evaluated lazily at resolution time —
 * for a paginated call, keyed off the most recent `.range(fromRow, toRow)`
 * (e.g. `fetchSessionStats`' page-by-page RPC/Sessions queries); for a
 * non-paginated call whose result still needs to reflect test state that
 * mutates between calls on the same chain (e.g. a version-query `.limit()`
 * read after a test bumps a version variable), a zero-arg function works
 * too — `fromRow`/`toRow` are simply ignored.
 *
 * Also records the `select` string and every `.filter()` call, for
 * assertions that don't want a dedicated mock reference per method.
 */
export function makeQueryChain(
	rows: unknown | ((fromRow?: number, toRow?: number) => unknown)
) {
	const record: {
		select?: string;
		filters: FilterCall[];
		range?: { fromRow: number; toRow: number };
	} = { filters: [] };
	const chain: Record<string, unknown> = {
		select: vi.fn((s: string) => {
			record.select = s;
			return chain;
		}),
		eq: vi.fn(() => chain),
		contains: vi.fn(() => chain),
		order: vi.fn(() => chain),
		range: vi.fn((fromRow: number, toRow: number) => {
			record.range = { fromRow, toRow };
			return chain;
		}),
		limit: vi.fn(() => chain),
		filter: vi.fn((column: string, operator: string, value: unknown) => {
			record.filters.push({ column, operator, value });
			return chain;
		}),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
			const data =
				typeof rows === 'function'
					? (rows as (fromRow?: number, toRow?: number) => unknown)(
							record.range?.fromRow,
							record.range?.toRow
						)
					: rows;
			return Promise.resolve({ data, error: null }).then(resolve);
		}
	};
	return { chain, record };
}
