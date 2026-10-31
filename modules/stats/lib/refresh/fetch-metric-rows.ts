import type { SupabaseClient } from '@supabase/supabase-js';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { MetricRpcParams } from '../../types';
import { runStatsCacheDbCall } from './db-call-logging';

/**
 * Calls one metric RPC once per filter object in `rpcParamsList`, concurrently,
 * and concatenates the rows. A single-element list is the ordinary one-call
 * case; `refreshSimpleStatsCache`'s `month`/`year`/`month-squashed` fan-out is
 * the many-element one. Concatenating before merging is safe because no two
 * periods' results ever share a `(species_id, time_period)` cell key, which is
 * all `indexByCell`/`mergeSimpleMetricRows` key on — for `month-squashed` that
 * holds only because `stats_spine`'s month-squashed branch honours
 * `month_filter` (#1178); before that every call returned all 12 cells.
 *
 * Each individual call is logged on its own, with its own `rpcParams`
 * (`runStatsCacheDbCall`) — a `day`-unit pass can call the same RPC name
 * several times with different `from_date`/`to_date` windows, and only
 * per-call logging tells those apart.
 *
 * Settled rather than raced (`Promise.allSettled`, not `Promise.all`): one
 * batch call failing must not stop a sibling batch for a different window
 * from also being attempted and logged — exactly the failure mode under
 * investigation, where it matters to know whether every window is slow or
 * just one. Concurrency is unchanged either way (same calls fire at once);
 * `allSettled` only changes whether the function waits for every call to
 * finish before deciding, rather than returning the instant the first one
 * settles. Once every call has settled, the *first* failure's original error
 * is rethrown unchanged, so `catchSupabaseErrors`'s message and any
 * `rejects.toThrow(...)` assertion still see exactly what they did before.
 */
export async function fetchMetricRows<Row>(
	supabaseClient: SupabaseClient,
	rpcName: string,
	rpcParamsList: MetricRpcParams[],
	context: Record<string, unknown>
): Promise<Row[]> {
	const settled = await Promise.allSettled(
		rpcParamsList.map((rpcParams) =>
			runStatsCacheDbCall<Row[] | null>(
				{ kind: 'rpc', rpcName, rpcParams },
				context,
				async () =>
					supabaseClient.rpc(rpcName, rpcParams).then(catchSupabaseErrors)
			)
		)
	);

	const firstFailure = settled.find(
		(result): result is PromiseRejectedResult => result.status === 'rejected'
	);
	if (firstFailure) {
		throw firstFailure.reason;
	}

	return (settled as PromiseFulfilledResult<Row[] | null>[]).flatMap(
		(result) => (result.value ?? []) as Row[]
	);
}
