import type { MetricRpcParams } from '../../types';

/**
 * Identifies one DB call for logging — enough to tell two calls of the same
 * kind apart (e.g. the same RPC name called once per `day`-unit batch window,
 * each with its own `from_date`/`to_date`; or an upsert chunk's own row count,
 * not the pass's total). `runStatsCacheDbCall` turns this into both the log
 * line's label and the extra metadata merged into its context object.
 */
type StatsCacheDbCallDescriptor =
	| { kind: 'select'; table: string }
	| { kind: 'rpc'; rpcName: string; rpcParams: MetricRpcParams }
	| { kind: 'upsert'; table: string; rowCount: number }
	| { kind: 'insert'; table: string; rowCount: number };

function describeStatsCacheDbCall(
	descriptor: StatsCacheDbCallDescriptor
): string {
	switch (descriptor.kind) {
		case 'select':
			return `${descriptor.table} select`;
		case 'rpc':
			return `${descriptor.rpcName} RPC`;
		case 'upsert':
			return `${descriptor.table} upsert`;
		case 'insert':
			return `${descriptor.table} insert`;
	}
}

function statsCacheDbCallMetadata(
	descriptor: StatsCacheDbCallDescriptor
): Record<string, unknown> {
	switch (descriptor.kind) {
		case 'select':
			return {};
		case 'rpc':
			return { rpcParams: descriptor.rpcParams };
		case 'upsert':
		case 'insert':
			return { rowCount: descriptor.rowCount };
	}
}

/**
 * Runs one DB call inside a `refreshSimpleStatsCache` pass, logging it —
 * labelled and with call-specific metadata (an RPC's own params, or an
 * upsert/insert's own row count) — on success as well as failure, so every
 * one of a pass's DB touchpoints is individually visible in logs, distinct
 * from every other. On failure, the original error still propagates
 * **unchanged** — same object, same message, so `catchSupabaseErrors`'s own
 * message and any `rejects.toThrow(...)` test keep working untouched.
 */
export async function runStatsCacheDbCall<T>(
	descriptor: StatsCacheDbCallDescriptor,
	context: Record<string, unknown>,
	fn: () => Promise<T>
): Promise<T> {
	const label = describeStatsCacheDbCall(descriptor);
	const fullContext = { ...context, ...statsCacheDbCallMetadata(descriptor) };
	try {
		const result = await fn();
		console.log(`Stats-cache refresh DB call succeeded: ${label}`, fullContext);
		return result;
	} catch (error) {
		console.error(
			`Stats-cache refresh DB call failed: ${label}`,
			fullContext,
			error
		);
		throw error;
	}
}
