import type { MetricRpcParams } from '../../types';

/** Identifies one DB call for logging — enough to tell apart two calls of the same kind (e.g. per-window RPC calls, per-chunk upserts). */
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

/** Runs and logs one DB call inside a refresh pass, on success and failure; rethrows the original error unchanged. */
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
