import { vi } from 'vitest';

type ThenableResult<T> = { data: T; error: null };

/**
 * A `.then()`-only thenable that resolves to `{ data, error: null }` —
 * the shape every Supabase table/RPC call ultimately awaits to.
 */
function makeThenable<T>(data: T) {
	return {
		then: (resolve: (v: ThenableResult<T>) => unknown) =>
			Promise.resolve({ data, error: null } as ThenableResult<T>).then(resolve)
	};
}

type Chain = Record<string, ReturnType<typeof vi.fn>> &
	ReturnType<typeof makeThenable>;

/**
 * Mock Supabase client whose `.from(...)` returns a chainable query builder
 * ending in a thenable resolving to `{ data, error: null }`.
 *
 * `chainMethods` lists the chainable methods the page under test calls
 * before awaiting the query — e.g. `['select', 'eq']` for a single filter,
 * `['select', 'eq', 'in']`, or `['select', 'eq', 'order']`. Each is mocked
 * with `mockReturnThis()`, and the returned `chain` lets a test assert on
 * how it was called (e.g. `expect(chain.eq).toHaveBeenCalledWith(...)`).
 * Defaults to `['select', 'eq']`, the shape of a simple group-scoped filter.
 */
export function makeSupabaseTableClient(
	data: unknown,
	chainMethods: string[] = ['select', 'eq']
) {
	const chain = {
		...Object.fromEntries(
			chainMethods.map((method) => [method, vi.fn().mockReturnThis()])
		),
		...makeThenable(data)
	} as Chain;
	const client = { from: vi.fn().mockReturnValue(chain) };
	return { client, chain };
}

/**
 * Mock Supabase client whose `.rpc(...)` resolves to `{ data, error: null }`
 * — for pages backed by a single RPC call with no chained filters.
 */
export function makeSupabaseRpcClient(data: unknown) {
	return { rpc: vi.fn().mockReturnValue(makeThenable(data)) };
}
