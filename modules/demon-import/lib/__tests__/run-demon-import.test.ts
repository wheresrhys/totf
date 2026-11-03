import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Transform } from 'node:stream';
import type { DemonImportUpdate, DemonRow } from '../../types';
import type { RunDemonImportOptions } from '../run-demon-import';
import { makeDemonRow } from './helpers/demon-rows';

vi.mock('@/modules/stats', () => ({
	dispatchStatsCacheRefreshEvents: vi.fn()
}));

// Wraps the real `pRateLimit` rather than replacing it, so every other test's
// actual rate-limiting behaviour (the timeout test below included) is
// unaffected — this only lets tests assert what `concurrency` it was built
// with.
vi.mock('p-ratelimit', async (importOriginal) => {
	const actual = await importOriginal<typeof import('p-ratelimit')>();
	return { ...actual, pRateLimit: vi.fn(actual.pRateLimit) };
});

vi.mock('../demon-records-batch-writer', () => ({
	DemonRecordsBatchWriter: vi.fn()
}));
vi.mock('../encounter-batch-writer', () => ({
	EncounterRowBatchWriter: vi.fn()
}));
vi.mock('../import-job-tracker', () => ({
	ImportJobTracker: vi.fn()
}));
vi.mock('../process-encounter-row', () => ({
	processEncounterRow: vi.fn()
}));
vi.mock('../locations', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../locations')>();
	return {
		...actual,
		findUnrecognisedLocationNames: vi.fn()
	};
});

const IMPORT_JOB_ID = 42;
const STAGED_DATES = ['2024-06-01'];
const TOUCHED_SPECIES_IDS = [7];
const RINGING_GROUP_ID = 1;

const CSV_HEADER =
	'ring_no,species_name,visit_date,capture_time,loc_id,age,sex,sexing_method,record_type,scheme,breeding_condition,extra_text,moult_code,old_greater_coverts,weight,wing_length,entered_by,nest_link_code,validation_comments,submission_status,filename,new/subsequent,scheme2,ring_no2,pulli_ringed,pulli_alive,provisional_sex,gridref,habitat_1,habitat_2,status_code_1,status_code_2,lure_code_1,lure_code_2,date_measured,time_w,condition,alula,primary_moult,primary_covert_moult_scores,secondary_moult_scores,finding_condition,finding_circumstances,capture_method,metal_mark_info,ringer_initials,ringer_check_initials,processor_initials,extractor_initials,wing_initials,colour_mark_info,metal_mark_position,fat,pectoral_muscle,body_moult,greater_covert_moult_scores,alula_moult_scores,carpal_covert_moult,wing_point,primary_length,bill_length_method,bill_length,head_bill_length,bill_depth_method,bill_depth,tarsus_length_method,tail_moult_scores,tarsus_length,tail_length,claw_length,plumage,tail_diff,lesser_median_covert_moult,underwing_covert_moult,head_moult,upperparts_moult,underparts_moult,permit_no,pullus_stage,date_accuracy,left_leg_below,right_leg_below,left_leg_above,right_leg_above,neck_collar,left_wing_tag,right_wing_tag,nasal_saddle,sample_processed,high_tide_time,finder_name,own,own2,userc1,userc2,email,userc3,userc4,userc5,userv1,userv2,userv3,userv4,userv5,l_primary_moult_scores,l_secondary_moult_scores,l_tail_moult_scores,l_primary_covert_moult_scores,l_greater_covert_moult_scores,l_carpal_covert_moult,l_alula_moult_scores,toe_span';

function makeCsvRow(overrides: Record<string, string> = {}): string {
	const defaults: Record<string, string> = {
		ring_no: 'A123456',
		species_name: 'Blue Tit',
		visit_date: '01/06/2024',
		capture_time: '08:30',
		loc_id: 'Garden Trap',
		age: '5',
		sex: 'M',
		sexing_method: 'P',
		record_type: 'N',
		scheme: 'BTO'
	};
	const values = { ...defaults, ...overrides };
	const headers = CSV_HEADER.split(',');
	return headers.map((h) => values[h] ?? '').join(',');
}

function makeCsvBuffer(rows: string[]): Buffer {
	return Buffer.from([CSV_HEADER, ...rows].join('\n'));
}

async function collectUpdates(
	source: Buffer | DemonRow[],
	supabaseClient: unknown = {},
	overrides: Partial<
		Pick<RunDemonImportOptions, 'concurrency' | 'timeoutMs' | 'logContext'>
	> = {}
): Promise<DemonImportUpdate[]> {
	const { runDemonImport } = await import('../run-demon-import');
	const updates: DemonImportUpdate[] = [];
	for await (const update of runDemonImport({
		supabaseClient: supabaseClient as never,
		ringingGroupId: RINGING_GROUP_ID,
		source,
		timeoutMs: 280_000,
		...overrides
	})) {
		updates.push(update);
	}
	return updates;
}

describe('runDemonImport', () => {
	let mockImportJobTracker: Record<string, ReturnType<typeof vi.fn>>;
	let mockDemonRecordsBatchWriter: Record<string, ReturnType<typeof vi.fn>>;
	let mockEncounterRowBatchWriter: Record<string, ReturnType<typeof vi.fn>>;

	beforeEach(async () => {
		vi.resetModules();

		const { DemonRecordsBatchWriter } =
			await import('../demon-records-batch-writer');
		const { EncounterRowBatchWriter } =
			await import('../encounter-batch-writer');
		const { ImportJobTracker } = await import('../import-job-tracker');
		const { findUnrecognisedLocationNames } = await import('../locations');
		const { dispatchStatsCacheRefreshEvents } = await import('@/modules/stats');

		mockDemonRecordsBatchWriter = {
			writeDemonRecord: vi.fn().mockResolvedValue(undefined),
			flushRemaining: vi.fn().mockResolvedValue(undefined),
			getDistinctDates: vi.fn().mockReturnValue(STAGED_DATES)
		};
		vi.mocked(DemonRecordsBatchWriter).mockImplementation(function () {
			return mockDemonRecordsBatchWriter as never;
		} as never);

		mockEncounterRowBatchWriter = {
			writeEncounterRow: vi.fn().mockResolvedValue({ visitDate: '2024-06-01' }),
			flushRemaining: vi.fn().mockResolvedValue(undefined),
			getDistinctSpeciesIds: vi.fn().mockReturnValue(TOUCHED_SPECIES_IDS)
		};
		vi.mocked(EncounterRowBatchWriter).mockImplementation(function () {
			return mockEncounterRowBatchWriter as never;
		} as never);

		mockImportJobTracker = {
			createImportJob: vi.fn().mockResolvedValue(IMPORT_JOB_ID),
			recordAffectedDates: vi.fn().mockResolvedValue(undefined),
			completeImportJob: vi.fn().mockResolvedValue(undefined),
			failImportJob: vi.fn().mockResolvedValue(undefined),
			markImportJobTimedOut: vi.fn().mockResolvedValue(undefined),
			markStatsCacheRefreshed: vi.fn().mockResolvedValue(undefined)
		};
		vi.mocked(ImportJobTracker).mockImplementation(function () {
			return mockImportJobTracker as never;
		} as never);

		vi.mocked(findUnrecognisedLocationNames).mockResolvedValue([]);
		vi.mocked(dispatchStatsCacheRefreshEvents).mockClear();
		vi.mocked(dispatchStatsCacheRefreshEvents).mockResolvedValue(undefined);

		const { processEncounterRow } = await import('../process-encounter-row');
		vi.mocked(processEncounterRow).mockResolvedValue({
			visitDate: '2024-06-01'
		});
	});

	describe('successful import', () => {
		it('calls processEncounterRow for each CSV row', async () => {
			const { processEncounterRow } = await import('../process-encounter-row');
			const buffer = makeCsvBuffer([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B654321' })
			]);
			await collectUpdates(buffer);
			expect(vi.mocked(processEncounterRow)).toHaveBeenCalledTimes(2);
		});

		it('yields a complete update with correct counts', async () => {
			const buffer = makeCsvBuffer([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B654321' })
			]);
			const updates = await collectUpdates(buffer);
			const complete = updates.find((u) => u.type === 'complete');
			expect(complete).toEqual({
				type: 'complete',
				processed: 2,
				successful: 2,
				failed: 0,
				skipped: 0
			});
		});

		it('yields a progress update every 10 rows', async () => {
			const rows = Array.from({ length: 25 }, (_, i) =>
				makeCsvRow({ ring_no: `R${i.toString().padStart(6, '0')}` })
			);
			const updates = await collectUpdates(makeCsvBuffer(rows));
			const progressUpdates = updates.filter((u) => u.type === 'progress');
			expect(progressUpdates).toHaveLength(2);
			expect(progressUpdates[0]).toEqual({ type: 'progress', processed: 10 });
			expect(progressUpdates[1]).toEqual({ type: 'progress', processed: 20 });
		});
	});

	describe('unrecognised location names', () => {
		beforeEach(async () => {
			// The shared module mock isn't auto-reset between tests, so clear the
			// call history these tests assert on.
			const { EncounterRowBatchWriter } =
				await import('../encounter-batch-writer');
			const { processEncounterRow } = await import('../process-encounter-row');
			vi.mocked(EncounterRowBatchWriter).mockClear();
			vi.mocked(processEncounterRow).mockClear();
			vi.mocked(processEncounterRow).mockResolvedValue({
				visitDate: '2024-06-01'
			});
		});

		it('yields an unrecognised_locations update listing the names, instead of processing any rows', async () => {
			const { findUnrecognisedLocationNames } = await import('../locations');
			vi.mocked(findUnrecognisedLocationNames).mockResolvedValue([
				'CES972',
				'Reedbed'
			]);

			const buffer = makeCsvBuffer([
				makeCsvRow({ loc_id: 'CES972' }),
				makeCsvRow({ ring_no: 'B654321', loc_id: 'Reedbed' })
			]);
			const updates = await collectUpdates(buffer);

			expect(updates).toEqual([
				{ type: 'unrecognised_locations', locations: ['CES972', 'Reedbed'] }
			]);
		});

		it('constructs no domain-table writer and processes no rows when aborting for unrecognised locations', async () => {
			const { findUnrecognisedLocationNames } = await import('../locations');
			const { EncounterRowBatchWriter } =
				await import('../encounter-batch-writer');
			const { processEncounterRow } = await import('../process-encounter-row');
			vi.mocked(findUnrecognisedLocationNames).mockResolvedValue(['CES972']);

			await collectUpdates(makeCsvBuffer([makeCsvRow({ loc_id: 'CES972' })]));

			expect(vi.mocked(EncounterRowBatchWriter)).not.toHaveBeenCalled();
			expect(vi.mocked(processEncounterRow)).not.toHaveBeenCalled();
		});

		it('opens no job at all when aborting for unrecognised locations', async () => {
			const { findUnrecognisedLocationNames } = await import('../locations');
			vi.mocked(findUnrecognisedLocationNames).mockResolvedValue(['CES972']);

			await collectUpdates(makeCsvBuffer([makeCsvRow({ loc_id: 'CES972' })]));

			// Opening one first would leave an orphan 'in_progress' row behind for an
			// upload that wrote nothing (#1079's zero-write guarantee).
			expect(mockImportJobTracker.createImportJob).not.toHaveBeenCalled();
		});

		it('proceeds with normal row processing when every loc_id already matches an existing Location', async () => {
			const { findUnrecognisedLocationNames } = await import('../locations');
			const { processEncounterRow } = await import('../process-encounter-row');

			const buffer = makeCsvBuffer([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B654321' })
			]);
			const updates = await collectUpdates(buffer);

			expect(vi.mocked(findUnrecognisedLocationNames)).toHaveBeenCalledWith(
				expect.anything(),
				['Garden Trap'],
				RINGING_GROUP_ID
			);
			expect(vi.mocked(processEncounterRow)).toHaveBeenCalledTimes(2);
			expect(updates.find((u) => u.type === 'complete')).toEqual({
				type: 'complete',
				processed: 2,
				successful: 2,
				failed: 0,
				skipped: 0
			});
		});
	});

	describe('error handling', () => {
		it('counts rows where processEncounterRow throws as failed', async () => {
			const { processEncounterRow } = await import('../process-encounter-row');
			vi.mocked(processEncounterRow)
				.mockResolvedValueOnce({ visitDate: '2024-06-01' })
				.mockRejectedValueOnce(new Error('DB error'))
				.mockResolvedValueOnce({ visitDate: '2024-06-02' });

			const buffer = makeCsvBuffer([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B000001' }),
				makeCsvRow({ ring_no: 'C000001' })
			]);
			const updates = await collectUpdates(buffer);
			const complete = updates.find((u) => u.type === 'complete');
			expect(complete).toEqual({
				type: 'complete',
				processed: 3,
				successful: 2,
				failed: 1,
				skipped: 0
			});
		});

		it('counts a CasualtyEncounterError row as skipped, not failed', async () => {
			const { processEncounterRow } = await import('../process-encounter-row');
			const { CasualtyEncounterError } = await import('../row-validation');
			vi.mocked(processEncounterRow)
				.mockResolvedValueOnce({ visitDate: '2024-06-01' })
				.mockRejectedValueOnce(new CasualtyEncounterError());

			const buffer = makeCsvBuffer([makeCsvRow(), makeCsvRow({ ring_no: '' })]);
			const updates = await collectUpdates(buffer);
			const complete = updates.find((u) => u.type === 'complete');
			expect(complete).toEqual({
				type: 'complete',
				processed: 2,
				successful: 1,
				failed: 0,
				skipped: 1
			});
		});

		it('yields an error update with no job opened when CSV parsing itself fails', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			vi.doMock('csv-parser', () => ({
				default: () =>
					new Transform({
						objectMode: true,
						transform(
							_chunk: unknown,
							_enc: string,
							callback: (err?: Error) => void
						) {
							callback(new Error('CSV parse error'));
						}
					})
			}));
			vi.resetModules();

			const { runDemonImport } = await import('../run-demon-import');
			const { ImportJobTracker } = await import('../import-job-tracker');
			vi.mocked(ImportJobTracker).mockImplementation(function () {
				return mockImportJobTracker as never;
			} as never);

			const updates: DemonImportUpdate[] = [];
			for await (const update of runDemonImport({
				supabaseClient: {} as never,
				ringingGroupId: RINGING_GROUP_ID,
				source: makeCsvBuffer([makeCsvRow()]),
				timeoutMs: 280_000
			})) {
				updates.push(update);
			}

			expect(updates).toContainEqual({
				type: 'error',
				message: 'CSV parse error'
			});
			expect(mockImportJobTracker.createImportJob).not.toHaveBeenCalled();

			// `vi.doMock` persists past the test that registered it, and an
			// always-erroring CSV parser would break every test declared after this
			// one.
			vi.doUnmock('csv-parser');
		});

		it('marks the job failed with the error message when the run throws after a job is opened', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const { EncounterRowBatchWriter } =
				await import('../encounter-batch-writer');
			// Thrown after the job row has been opened — unlike a CSV parse error,
			// which happens before there is anything to mark.
			vi.mocked(EncounterRowBatchWriter).mockImplementation(function () {
				throw new Error('could not build writers');
			} as never);

			const updates = await collectUpdates(makeCsvBuffer([makeCsvRow()]));

			expect(updates).toContainEqual({
				type: 'error',
				message: 'could not build writers'
			});
			expect(mockImportJobTracker.failImportJob).toHaveBeenCalledWith(
				IMPORT_JOB_ID,
				'could not build writers'
			);
			expect(mockImportJobTracker.completeImportJob).not.toHaveBeenCalled();
		});
	});

	describe('chunked domain-table writing', () => {
		it('builds the domain-table writer for the run’s group and job, and flushes its trailing chunk', async () => {
			const { EncounterRowBatchWriter } =
				await import('../encounter-batch-writer');

			const buffer = makeCsvBuffer([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B000001' })
			]);
			await collectUpdates(buffer);

			expect(vi.mocked(EncounterRowBatchWriter)).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					ringingGroupId: RINGING_GROUP_ID,
					importJobId: IMPORT_JOB_ID,
					limitChunkFlush: expect.any(Function)
				})
			);
			// Without this the run would deadlock on the trailing chunk, whose rows
			// the `Promise.all` below it is waiting on.
			expect(mockEncounterRowBatchWriter.flushRemaining).toHaveBeenCalledTimes(
				1
			);
		});
	});

	describe('ImportJobs tracking', () => {
		it('opens a job for the group and completes it with the counts it reported', async () => {
			const buffer = makeCsvBuffer([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B000001' })
			]);
			await collectUpdates(buffer);

			expect(mockImportJobTracker.createImportJob).toHaveBeenCalledWith(
				RINGING_GROUP_ID
			);
			expect(mockImportJobTracker.completeImportJob).toHaveBeenCalledWith(
				IMPORT_JOB_ID,
				{ processed: 2, successful: 2, failed: 0, skipped: 0 }
			);
		});

		it('records the staged dates once every DemonRecords batch has landed', async () => {
			const { DemonRecordsBatchWriter } =
				await import('../demon-records-batch-writer');

			const buffer = makeCsvBuffer([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B000001' })
			]);
			await collectUpdates(buffer);

			expect(vi.mocked(DemonRecordsBatchWriter)).toHaveBeenCalledWith(
				expect.anything(),
				{ importJobId: IMPORT_JOB_ID, ringingGroupId: RINGING_GROUP_ID }
			);
			expect(mockDemonRecordsBatchWriter.flushRemaining).toHaveBeenCalledTimes(
				1
			);
			expect(mockImportJobTracker.recordAffectedDates).toHaveBeenCalledWith(
				IMPORT_JOB_ID,
				STAGED_DATES
			);
		});
	});

	describe('stats-cache-refresh-window dispatch', () => {
		it("dispatches the run's affected dates and touched species for the group, after the job is marked succeeded", async () => {
			const { dispatchStatsCacheRefreshEvents } =
				await import('@/modules/stats');

			await collectUpdates(makeCsvBuffer([makeCsvRow()]));

			expect(dispatchStatsCacheRefreshEvents).toHaveBeenCalledTimes(1);
			expect(dispatchStatsCacheRefreshEvents).toHaveBeenCalledWith(
				IMPORT_JOB_ID,
				RINGING_GROUP_ID,
				STAGED_DATES,
				TOUCHED_SPECIES_IDS,
				{}
			);

			// Ordering: dispatch happens only after the job is marked succeeded.
			const completeOrder =
				mockImportJobTracker.completeImportJob.mock.invocationCallOrder[0];
			const dispatchOrder = vi.mocked(dispatchStatsCacheRefreshEvents).mock
				.invocationCallOrder[0];
			expect(dispatchOrder).toBeGreaterThan(completeOrder);
		});

		it('does not dispatch any events when the run times out', async () => {
			const { EncounterRowBatchWriter } =
				await import('../encounter-batch-writer');
			const { processEncounterRow } = await import('../process-encounter-row');
			const { dispatchStatsCacheRefreshEvents } =
				await import('@/modules/stats');

			// Captured so the test can trigger the real (unmocked)
			// `ImportDeadlineExceededError` the orchestrator closes over internally —
			// `instanceof` only recognises that exact class reference, so this is
			// the only way to provoke the timeout branch without waiting out the
			// real deadline.
			let capturedLimitChunkFlush:
				| ((flushChunk: () => Promise<void>) => Promise<unknown>)
				| undefined;
			vi.mocked(EncounterRowBatchWriter).mockImplementation(function (
				_client: unknown,
				options: { limitChunkFlush: typeof capturedLimitChunkFlush }
			) {
				capturedLimitChunkFlush = options.limitChunkFlush;
				return mockEncounterRowBatchWriter as never;
			} as never);

			// Fake timers freeze `Date.now()` at a single deterministic value
			// (rather than ticking on real wall-clock time), so the deadline
			// computation and the later deadline check can be put on either side
			// of an explicit jump with no dependence on how many incidental
			// `Date.now()` calls (p-ratelimit's own bookkeeping, etc.) happen in
			// between.
			vi.useFakeTimers();

			vi.mocked(processEncounterRow).mockImplementation(async () => {
				// Past the orchestrator's deadline, which was computed against the
				// frozen "now" in place before this jump.
				vi.setSystemTime(Date.now() + 281_000);
				await capturedLimitChunkFlush!(async () => {});
				return { visitDate: '2024-06-01' };
			});

			const updates = await collectUpdates(makeCsvBuffer([makeCsvRow()]));
			vi.useRealTimers();

			expect(updates.some((u) => u.type === 'timeout')).toBe(true);
			expect(dispatchStatsCacheRefreshEvents).not.toHaveBeenCalled();
		});

		it('does not dispatch any events when the run fails before completion', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const { EncounterRowBatchWriter } =
				await import('../encounter-batch-writer');
			const { dispatchStatsCacheRefreshEvents } =
				await import('@/modules/stats');
			vi.mocked(EncounterRowBatchWriter).mockImplementation(function () {
				throw new Error('could not build writers');
			} as never);

			const updates = await collectUpdates(makeCsvBuffer([makeCsvRow()]));

			expect(updates).toContainEqual({
				type: 'error',
				message: 'could not build writers'
			});
			expect(dispatchStatsCacheRefreshEvents).not.toHaveBeenCalled();
		});
	});

	describe('generalized options (CLI reuse)', () => {
		it('accepts an already-materialized DemonRow[] source, skipping CSV parsing entirely', async () => {
			const { processEncounterRow } = await import('../process-encounter-row');
			// The shared module mock isn't auto-reset between tests (see the
			// "unrecognised location names" describe block above) — clear the
			// call history this exact-count assertion depends on.
			vi.mocked(processEncounterRow).mockClear();
			vi.mocked(processEncounterRow).mockResolvedValue({
				visitDate: '2024-06-01'
			});

			const rows = [makeDemonRow(), makeDemonRow({ ring_no: 'B654321' })];
			const updates = await collectUpdates(rows);

			expect(vi.mocked(processEncounterRow)).toHaveBeenCalledTimes(2);
			expect(updates.find((u) => u.type === 'complete')).toEqual({
				type: 'complete',
				processed: 2,
				successful: 2,
				failed: 0,
				skipped: 0
			});
		});

		it('never times out when timeoutMs is omitted, even long after a passed deadline would have fired', async () => {
			const { EncounterRowBatchWriter } =
				await import('../encounter-batch-writer');
			let capturedLimitChunkFlush:
				| ((flushChunk: () => Promise<void>) => Promise<unknown>)
				| undefined;
			vi.mocked(EncounterRowBatchWriter).mockImplementation(function (
				_client: unknown,
				options: { limitChunkFlush: typeof capturedLimitChunkFlush }
			) {
				capturedLimitChunkFlush = options.limitChunkFlush;
				return mockEncounterRowBatchWriter as never;
			} as never);

			vi.useFakeTimers();
			const { processEncounterRow } = await import('../process-encounter-row');
			vi.mocked(processEncounterRow).mockImplementation(async () => {
				vi.setSystemTime(Date.now() + 10_000_000);
				await capturedLimitChunkFlush!(async () => {});
				return { visitDate: '2024-06-01' };
			});

			const updates = await collectUpdates(
				makeCsvBuffer([makeCsvRow()]),
				{},
				{ timeoutMs: undefined }
			);
			vi.useRealTimers();

			expect(updates.some((u) => u.type === 'timeout')).toBe(false);
			expect(updates.find((u) => u.type === 'complete')).toBeTruthy();
		});

		it('builds the rate limiter with the default concurrency when none is given', async () => {
			const { pRateLimit } = await import('p-ratelimit');

			await collectUpdates(makeCsvBuffer([makeCsvRow()]));

			expect(vi.mocked(pRateLimit)).toHaveBeenCalledWith(
				expect.objectContaining({ concurrency: 30 })
			);
		});

		it('builds the rate limiter with a given concurrency value', async () => {
			const { pRateLimit } = await import('p-ratelimit');

			await collectUpdates(
				makeCsvBuffer([makeCsvRow()]),
				{},
				{ concurrency: 1 }
			);

			expect(vi.mocked(pRateLimit)).toHaveBeenCalledWith(
				expect.objectContaining({ concurrency: 1 })
			);
		});

		it('merges logContext into the stats-cache-refresh dispatch call', async () => {
			const { dispatchStatsCacheRefreshEvents } =
				await import('@/modules/stats');

			await collectUpdates(
				makeCsvBuffer([makeCsvRow()]),
				{},
				{ logContext: { csvFilePath: 'data.csv' } }
			);

			expect(dispatchStatsCacheRefreshEvents).toHaveBeenCalledWith(
				IMPORT_JOB_ID,
				RINGING_GROUP_ID,
				STAGED_DATES,
				TOUCHED_SPECIES_IDS,
				{ csvFilePath: 'data.csv' }
			);
		});
	});
});
