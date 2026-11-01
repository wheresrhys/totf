import type { SupabaseClient } from '@supabase/supabase-js';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { MetricRpcParams } from '../../types';
import { runStatsCacheDbCall } from './db-call-logging';

/** Calls one metric RPC once per filter object in `rpcParamsList`, concurrently and individually logged, concatenating the rows — see this module's CLAUDE.md for why `allSettled` rather than `Promise.all`. */
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
