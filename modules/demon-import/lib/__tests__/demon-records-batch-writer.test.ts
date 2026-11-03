import { describe, it, expect, vi } from 'vitest';
import { makeDemonRow, makeDemonRows } from './helpers/demon-rows';
import {
	settlePendingMicrotasks,
	trackSettlement
} from './helpers/promise-settlement';
import {
	makeStagingWriter,
	STAGING_IMPORT_JOB_ID,
	STAGING_RINGING_GROUP_ID
} from './helpers/staging-writer';

describe('DemonRecordsBatchWriter buffering', () => {
	it('flushes a batch as a single multi-row upsert once writeDemonRecord has been called batchSize times', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(3);

		for (const row of makeDemonRows(3)) writer.writeDemonRecord(row);
		await settlePendingMicrotasks();

		expect(demonRecordsClient.from).toHaveBeenCalledWith('DemonRecords');
		expect(demonRecordsClient.upsert).toHaveBeenCalledTimes(1);
		expect(demonRecordsClient.rowsOfBatch()).toHaveLength(3);
		expect(demonRecordsClient.rowsOfBatch().map((row) => row.ring_no)).toEqual([
			'A000000',
			'A000001',
			'A000002'
		]);
	});

	it("resolves every row's writeDemonRecord promise together, only once their shared batch has flushed", async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(3);

		const settlements = makeDemonRows(3).map((row) =>
			trackSettlement(writer.writeDemonRecord(row))
		);
		await settlePendingMicrotasks();

		// The insert is in flight, so no row is clear to be interpreted yet.
		expect(settlements.map(({ resolved }) => resolved)).toEqual([
			false,
			false,
			false
		]);

		await demonRecordsClient.landBatch();

		expect(settlements.map(({ resolved }) => resolved)).toEqual([
			true,
			true,
			true
		]);
	});

	it("stamps every row in a flushed batch with the current run's import_job_id and group", async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);

		for (const row of makeDemonRows(2)) writer.writeDemonRecord(row);
		await settlePendingMicrotasks();

		for (const stagedRow of demonRecordsClient.rowsOfBatch()) {
			expect(stagedRow.import_job_id).toBe(STAGING_IMPORT_JOB_ID);
			expect(stagedRow.ringing_group_id).toBe(STAGING_RINGING_GROUP_ID);
		}
	});

	it('stages the row essentially verbatim, alongside the dedup key pulled out as real columns', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(1);

		const rawRow = makeDemonRow({
			ring_no: ' A123456 ',
			visit_date: '15/03/2024',
			capture_time: '08:30'
		});
		writer.writeDemonRecord(rawRow);
		await settlePendingMicrotasks();

		expect(demonRecordsClient.rowsOfBatch()[0]).toMatchObject({
			// Untransformed: a non-lossy copy of what was submitted is the whole
			// point of the table.
			raw_row: rawRow,
			// Trimmed and date-converted, so they match Birds.ring_no /
			// Sessions.visit_date and can take part in the dedup constraint.
			ring_no: 'A123456',
			encounter_date: '2024-03-15',
			encounter_time: '08:30'
		});
	});

	it('applies ON CONFLICT DO NOTHING against the group/ring/date/time dedup key', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(1);

		writer.writeDemonRecord(makeDemonRow());
		await settlePendingMicrotasks();

		expect(demonRecordsClient.optionsOfBatch()).toEqual({
			onConflict: 'ringing_group_id,ring_no,encounter_date,encounter_time',
			ignoreDuplicates: true
		});
	});

	it('flushRemaining flushes a partial batch smaller than batchSize left over after all rows have been pushed', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(3);

		const settlements = makeDemonRows(4).map((row) =>
			trackSettlement(writer.writeDemonRecord(row))
		);
		// The first three filled a batch; the fourth is still sitting in the buffer.
		await settlePendingMicrotasks();
		expect(demonRecordsClient.upsert).toHaveBeenCalledTimes(1);

		const flushed = writer.flushRemaining();
		await demonRecordsClient.landBatch(0);

		expect(demonRecordsClient.upsert).toHaveBeenCalledTimes(2);
		expect(demonRecordsClient.rowsOfBatch(1)).toHaveLength(1);

		await demonRecordsClient.landBatch(1);
		await flushed;

		expect(settlements.map(({ resolved }) => resolved)).toEqual([
			true,
			true,
			true,
			true
		]);
	});

	it('getDistinctDates returns the distinct dates across every batch flushed so far', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);

		writer.writeDemonRecord(makeDemonRow({ visit_date: '15/03/2024' }));
		writer.writeDemonRecord(
			makeDemonRow({ ring_no: 'A000001', visit_date: '15/03/2024' })
		);
		writer.writeDemonRecord(
			makeDemonRow({ ring_no: 'A000002', visit_date: '14/03/2024' })
		);
		const flushed = writer.flushRemaining();

		// Nothing has landed yet, so nothing is reportable as durably staged.
		expect(writer.getDistinctDates()).toEqual([]);

		await demonRecordsClient.landBatch(0);
		await demonRecordsClient.landBatch(1);
		await flushed;

		expect(writer.getDistinctDates()).toEqual(['2024-03-14', '2024-03-15']);
	});

	it('skips a row with no ring number, rather than failing its whole batch on a NOT NULL column', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);

		// A casualty record carries no ring number, so it has no representable
		// staging row — it resolves straight away and is left to fail (or not) in
		// the domain-table write as it always did.
		const casualtyRow = trackSettlement(
			writer.writeDemonRecord(makeDemonRow({ ring_no: '' }))
		);
		await settlePendingMicrotasks();
		expect(casualtyRow.resolved).toBe(true);
		expect(demonRecordsClient.upsert).not.toHaveBeenCalled();

		writer.writeDemonRecord(makeDemonRow());
		writer.writeDemonRecord(makeDemonRow({ ring_no: 'A000001' }));
		await settlePendingMicrotasks();

		expect(demonRecordsClient.rowsOfBatch()).toHaveLength(2);
	});

	it("skips a row whose ring number is the '-' casualty sentinel, rather than failing its whole batch", async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);

		const casualtyRow = trackSettlement(
			writer.writeDemonRecord(makeDemonRow({ ring_no: '-' }))
		);
		const whitespaceCasualtyRow = trackSettlement(
			writer.writeDemonRecord(makeDemonRow({ ring_no: ' - ' }))
		);
		await settlePendingMicrotasks();
		expect(casualtyRow.resolved).toBe(true);
		expect(whitespaceCasualtyRow.resolved).toBe(true);
		expect(demonRecordsClient.upsert).not.toHaveBeenCalled();

		writer.writeDemonRecord(makeDemonRow());
		writer.writeDemonRecord(makeDemonRow({ ring_no: 'A000001' }));
		await settlePendingMicrotasks();

		expect(demonRecordsClient.rowsOfBatch()).toHaveLength(2);
	});

	it('re-staging the same rows (a simulated retry) inserts them again under ON CONFLICT DO NOTHING rather than erroring', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);
		const rows = makeDemonRows(2);

		const firstAttempt = rows.map((row) => writer.writeDemonRecord(row));
		await demonRecordsClient.landBatch(0);
		await Promise.all(firstAttempt);

		const retry = rows.map((row) => writer.writeDemonRecord(row));
		await demonRecordsClient.landBatch(1);
		await expect(Promise.all(retry)).resolves.toBeDefined();

		// Identical payload and identical conflict handling both times — the
		// database, not the writer, is what makes the retry a no-op per row.
		expect(demonRecordsClient.rowsOfBatch(1)).toEqual(
			demonRecordsClient.rowsOfBatch(0)
		);
		expect(demonRecordsClient.optionsOfBatch(1)).toEqual(
			demonRecordsClient.optionsOfBatch(0)
		);
		expect(writer.getDistinctDates()).toEqual(['2024-06-01']);
	});

	it('a batch flush failure rejects every pending promise in that batch', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const batchFailure = { message: 'insert into DemonRecords denied' };

		const settlements = makeDemonRows(2).map((row) =>
			trackSettlement(writer.writeDemonRecord(row))
		);
		await demonRecordsClient.failBatch(0, batchFailure);
		await writer.flushRemaining();

		expect(settlements.map(({ rejectedWith }) => rejectedWith)).toEqual([
			batchFailure,
			batchFailure
		]);
		// A failed batch contributes no dates: affected_dates only ever describes
		// what is durably staged.
		expect(writer.getDistinctDates()).toEqual([]);
	});

	it('a batch flush failure is logged with the job, group, row count and row positions', async () => {
		const { demonRecordsClient, writer } = makeStagingWriter(2);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const batchFailure = { message: 'insert into DemonRecords denied' };

		const settlements = makeDemonRows(2).map((row) =>
			trackSettlement(writer.writeDemonRecord(row))
		);
		await demonRecordsClient.failBatch(0, batchFailure);
		await writer.flushRemaining();

		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining('DemonRecords batch'),
			{
				importJobId: STAGING_IMPORT_JOB_ID,
				ringingGroupId: STAGING_RINGING_GROUP_ID,
				rowCount: 2,
				rowIndices: [0, 1]
			},
			batchFailure
		);
		// Asserted so the rejections above are observed, not unhandled.
		expect(settlements.map(({ rejectedWith }) => rejectedWith)).not.toContain(
			undefined
		);
	});
});
