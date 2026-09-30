import { vi } from 'vitest';

export type RpcCall = { name: string; args: Record<string, unknown> };

/**
 * A Supabase `.rpc(name, args)` mock that records every call and resolves
 * (thenable, like the real PostgrestFilterBuilder) to `{ data, error: null }`.
 *
 * `rows` is either the static data every call resolves with (e.g.
 * `sp-data.test.ts`'s `makeClient`, `spp-data.test.ts`'s rpc setup), or a
 * `(name) => data` function evaluated per call, keyed off the rpc name — for
 * a client that calls more than one distinct rpc and needs each to resolve
 * different rows (e.g. `sp-data.test.ts`'s `makeStatsHistoryClient`,
 * dispatching `core_stats` vs `biometrics_stats`).
 */
export function makeRpcCallRecorder(
	rows: unknown | ((name: string) => unknown)
) {
	const calls: RpcCall[] = [];
	const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
		calls.push({ name, args });
		const data =
			typeof rows === 'function'
				? (rows as (name: string) => unknown)(name)
				: rows;
		return {
			then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
				Promise.resolve({ data, error: null }).then(resolve)
		};
	});
	return { rpc, calls };
}

export type RpcChainCall = { rpcCall: unknown[]; orderCalls: unknown[][] };

/**
 * A Supabase `.rpc(...args).order(...).range(...)` chain mock, for RPC calls
 * that page through `fetchAllPaginatedRows` (`lib/supabase.ts`) rather than
 * resolving `.rpc()` directly. `order`/`range` are real shared `vi.fn()`s so
 * existing `toHaveBeenCalledWith`/`mockResolvedValueOnce` assertions on them
 * keep working unchanged; `calls` accumulates one `{ rpcCall, orderCalls }`
 * bundle per `rpc()` invocation, appended when `range()` is called on that
 * chain (mirroring `range()` being the point a real paginated query
 * actually fires).
 */
export function makeRpcChainRecorder() {
	const order = vi.fn();
	const range = vi.fn();
	const calls: RpcChainCall[] = [];

	const rpc = vi.fn((...rpcArgs: unknown[]) => {
		const call: RpcChainCall = { rpcCall: rpcArgs, orderCalls: [] };
		const builder = {
			order: (...orderArgs: unknown[]) => {
				order(...orderArgs);
				call.orderCalls.push(orderArgs);
				return builder;
			},
			range: (...rangeArgs: unknown[]) => {
				calls.push(call);
				return range(...rangeArgs);
			}
		};
		return builder;
	});

	return { rpc, order, range, calls };
}
