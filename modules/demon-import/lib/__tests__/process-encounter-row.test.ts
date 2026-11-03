import { describe, it, expect, vi } from 'vitest';
import { processEncounterRow } from '../process-encounter-row';
import { makeDemonRow, makeDemonRows } from './helpers/demon-rows';
import {
	settlePendingMicrotasks,
	trackSettlement
} from './helpers/promise-settlement';
import { makeStagingWriter } from './helpers/staging-writer';
import {
	makeEncounterRowWriter,
	neverRunningChunkLimiter
} from './helpers/encounter-row-writer';

describe('processEncounterRow orchestration', () => {
	it('awaits writeDemonRecord before handing the row to the domain-table writer', async () => {
		const { demonRecordsClient, writer: stagingWriter } = makeStagingWriter(1);
		const { writer: encounterRowBatchWriter } = makeEncounterRowWriter({
			chunkSize: 1
		});
		const writeEncounterRow = vi.spyOn(
			encounterRowBatchWriter,
			'writeEncounterRow'
		);

		const row = makeDemonRow();
		const processed = processEncounterRow(
			row,
			stagingWriter,
			encounterRowBatchWriter
		);
		await settlePendingMicrotasks();

		expect(demonRecordsClient.upsert).toHaveBeenCalledTimes(1);
		expect(writeEncounterRow).not.toHaveBeenCalled();

		await demonRecordsClient.landBatch();

		await expect(processed).resolves.toEqual({ visitDate: '2024-06-01' });
		expect(writeEncounterRow).toHaveBeenCalledWith(row);
	});

	it('a row whose writeDemonRecord promise rejects never reaches the domain-table writer', async () => {
		const { demonRecordsClient, writer: stagingWriter } = makeStagingWriter(1);
		const { writer: encounterRowBatchWriter } = makeEncounterRowWriter({
			chunkSize: 1
		});
		const writeEncounterRow = vi.spyOn(
			encounterRowBatchWriter,
			'writeEncounterRow'
		);
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const settlement = trackSettlement(
			processEncounterRow(
				makeDemonRow(),
				stagingWriter,
				encounterRowBatchWriter
			)
		);
		await demonRecordsClient.failBatch(0, { message: 'staging write failed' });

		expect(settlement.rejectedWith).toMatchObject({
			message: 'staging write failed'
		});
		expect(writeEncounterRow).not.toHaveBeenCalled();
	});

	it('lets an earlier batch’s rows write to the domain tables while a later batch is still in flight', async () => {
		const { demonRecordsClient, writer: stagingWriter } = makeStagingWriter(2);
		const { writer: encounterRowBatchWriter, domainTablesClient } =
			makeEncounterRowWriter({ chunkSize: 2 });

		const rows = makeDemonRows(4);
		const processed = rows.map((row) =>
			processEncounterRow(row, stagingWriter, encounterRowBatchWriter)
		);
		const flushed = stagingWriter.flushRemaining();

		// Only the first batch has landed; the second is still in flight.
		await demonRecordsClient.landBatch(0);
		await Promise.all(processed.slice(0, 2));

		expect(domainTablesClient.rowsUpsertedInto('Encounters')).toHaveLength(2);

		await demonRecordsClient.landBatch(1);
		await flushed;
		await encounterRowBatchWriter.flushRemaining();
		await Promise.all(processed);

		expect(
			domainTablesClient
				.tablesInCallOrder()
				.filter((table) => table === 'Encounters')
		).toHaveLength(2);
	});

	it('fills a staging batch larger than the domain limiter’s concurrency cap, because the limiter wraps only a chunk flush', async () => {
		const { demonRecordsClient, writer: stagingWriter } = makeStagingWriter(3);
		// A limiter that admits one flush at a time and never releases it, standing
		// in for a concurrency cap smaller than the staging batch. If it wrapped the
		// whole row rather than just the chunk flush, rows 2 and 3 could never reach
		// the staging buffer and the batch could never fill.
		const { limitChunkFlush, flushesAdmitted } = neverRunningChunkLimiter();
		const { writer: encounterRowBatchWriter } = makeEncounterRowWriter({
			chunkSize: 3,
			limitChunkFlush
		});

		for (const row of makeDemonRows(3)) {
			trackSettlement(
				processEncounterRow(row, stagingWriter, encounterRowBatchWriter)
			);
		}
		await settlePendingMicrotasks();

		expect(demonRecordsClient.upsert).toHaveBeenCalledTimes(1);
		expect(demonRecordsClient.rowsOfBatch()).toHaveLength(3);

		await demonRecordsClient.landBatch();

		// All three rows reached the domain writer and filled one chunk.
		expect(flushesAdmitted).toHaveLength(1);
	});
});
