import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPaginatedRows } from '@/lib/supabase';
import type { MetricRpcParams } from '../../types';
import { runStatsCacheDbCall } from './db-call-logging';

/**
 * Calls one metric RPC once per filter object in `rpcParamsList`, concurrently
 * and individually logged, concatenating the rows — see this module's
 * CLAUDE.md for why `allSettled` rather than `Promise.all`.
 *
 * Each call is paginated via `fetchAllPaginatedRows`, the same mechanism
 * `readStatsCacheRows` uses for the cache-table side of this comparison —
 * without it, a filter window whose result exceeds PostgREST's 1000-row cap
 * would silently truncate. Pagination via `.range()` only takes effect on a
 * **GET** request, not the client's default POST, so every call also passes
 * `{ get: true }`: safe here since all four `stats_cache_*_metrics` RPCs are
 * `STABLE` with purely scalar `MetricRpcParams` fields — exactly what
 * postgrest-js's GET path serializes to query params.
 */
export async function fetchMetricRows<Row>(
	supabaseClient: SupabaseClient,
	rpcName: string,
	rpcParamsList: MetricRpcParams[],
	context: Record<string, unknown>
): Promise<Row[]> {
	const settled = await Promise.allSettled(
		rpcParamsList.map((rpcParams) =>
			runStatsCacheDbCall<Row[]>(
				{ kind: 'rpc', rpcName, rpcParams },
				context,
				() =>
					fetchAllPaginatedRows<Row>((fromRow, toRow) =>
						supabaseClient
							.rpc(rpcName, rpcParams, { get: true })
							.range(fromRow, toRow)
					)
			)
		)
	);

	const firstFailure = settled.find(
		(result): result is PromiseRejectedResult => result.status === 'rejected'
	);
	if (firstFailure) {
		throw firstFailure.reason;
	}

	return (settled as PromiseFulfilledResult<Row[]>[]).flatMap(
		(result) => result.value
	);
}
