import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DemonRecordsBatchWriter } from '../../demon-records-batch-writer';
import { settlePendingMicrotasks } from './promise-settlement';

export const STAGING_IMPORT_JOB_ID = 42;
export const STAGING_RINGING_GROUP_ID = 7;

/**
 * Mock Supabase client whose `DemonRecords` upsert settles only when a test says
 * so — which is what makes "has this row's batch landed yet?" directly
 * observable rather than a matter of microtask timing.
 */
export function makeDemonRecordsClient() {
	const pendingBatches: ((result: { error: unknown }) => void)[] = [];
	const upsert = vi.fn<
		(rows: Record<string, unknown>[], options: Record<string, unknown>) => void
	>(
		() =>
			new Promise<{ error: unknown }>((resolve) => {
				pendingBatches.push(resolve);
			})
	);
	const from = vi.fn(() => ({ upsert }));

	return {
		// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain the batch writer uses, not the full SupabaseClient interface
		client: { from } as unknown as SupabaseClient,
		from,
		upsert,
		/** The rows handed to the `callIndex`th (0-based) batch insert. */
		rowsOfBatch: (callIndex = 0) => upsert.mock.calls[callIndex][0],
		/** The upsert options handed to the `callIndex`th batch insert. */
		optionsOfBatch: (callIndex = 0) => upsert.mock.calls[callIndex][1],
		// Batches are chained, so the nth insert isn't even issued until the
		// (n-1)th has landed — hence waiting for it to appear before settling it.
		landBatch: async (callIndex = 0) => {
			await settlePendingMicrotasks();
			pendingBatches[callIndex]({ error: null });
			await settlePendingMicrotasks();
		},
		failBatch: async (callIndex: number, error: unknown) => {
			await settlePendingMicrotasks();
			pendingBatches[callIndex]({ error });
			await settlePendingMicrotasks();
		}
	};
}

export function makeStagingWriter(batchSize: number) {
	const demonRecordsClient = makeDemonRecordsClient();
	const writer = new DemonRecordsBatchWriter(demonRecordsClient.client, {
		importJobId: STAGING_IMPORT_JOB_ID,
		ringingGroupId: STAGING_RINGING_GROUP_ID,
		batchSize
	});
	return { demonRecordsClient, writer };
}
