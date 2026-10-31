import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Transform } from 'node:stream';
import type { ImportMessage } from '../route';

// group-cookie is mocked globally to return group ID 1 (see vitest.setup.tsx)

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/lib/demon-import', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/demon-import')>();
	return {
		...actual,
		DemonRecordsBatchWriter: vi.fn(),
		EncounterRowBatchWriter: vi.fn(),
		ImportJobTracker: vi.fn(),
		processEncounterRow: vi.fn(),
		findUnrecognisedLocationNames: vi.fn()
	};
});

vi.mock('@/modules/stats', () => ({
	dispatchStatsCacheRefreshEvents: vi.fn()
}));

const IMPORT_JOB_ID = 42;
const STAGED_DATES = ['2024-06-01'];
const TOUCHED_SPECIES_IDS = [7];

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

function makeCsvFile(rows: string[]): File {
	const content = [CSV_HEADER, ...rows].join('\n');
	return new File([content], 'test.csv', { type: 'text/csv' });
}

async function makeRequest(file: File): Promise<Request> {
	const formData = new FormData();
	formData.append('csv', file);
	return new Request('http://localhost/api/import', {
		method: 'POST',
		body: formData
	});
}

async function readStreamMessages(
	response: Response
): Promise<ImportMessage[]> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	const messages: ImportMessage[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop()!;
		for (const line of lines) {
			if (line.trim()) messages.push(JSON.parse(line));
		}
	}
	return messages;
}

describe('POST /api/import', () => {
	let POST: (request: Request) => Promise<Response>;
	let mockImportJobTracker: Record<string, ReturnType<typeof vi.fn>>;
	let mockDemonRecordsBatchWriter: Record<string, ReturnType<typeof vi.fn>>;
	let mockEncounterRowBatchWriter: Record<string, ReturnType<typeof vi.fn>>;

	beforeEach(async () => {
		vi.resetModules();
		({ POST } = await import('../route'));

		const { getAuthenticatedSupabaseClient } =
			await import('@/app/lib/auth/group-auth');
		const {
			DemonRecordsBatchWriter,
			EncounterRowBatchWriter,
			ImportJobTracker
		} = await import('@/lib/demon-import');
		mockDemonRecordsBatchWriter = {
			writeDemonRecord: vi.fn().mockResolvedValue(undefined),
			flushRemaining: vi.fn().mockResolvedValue(undefined),
			getDistinctDates: vi.fn().mockReturnValue(STAGED_DATES)
		};
		// Newable for the same reason as the `ImportJobTracker` stub below.
		vi.mocked(DemonRecordsBatchWriter).mockImplementation(function () {
			return mockDemonRecordsBatchWriter as never;
		} as never);
		mockEncounterRowBatchWriter = {
			writeEncounterRow: vi.fn().mockResolvedValue({ visitDate: '2024-06-01' }),
			flushRemaining: vi.fn().mockResolvedValue(undefined),
			getDistinctSpeciesIds: vi.fn().mockReturnValue(TOUCHED_SPECIES_IDS)
		};
		// Newable for the same reason as the two stubs either side of it.
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
		// A plain arrow function is not newable, and the route now does `new
		// ImportJobTracker(...)` — so the stub has to be a `function`, whose
		// returned object becomes the constructed instance.
		vi.mocked(ImportJobTracker).mockImplementation(function () {
			return mockImportJobTracker as never;
		} as never);
		vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue({} as never);

		// Every location in the CSV is already known unless a test says otherwise.
		const { findUnrecognisedLocationNames } =
			await import('@/lib/demon-import');
		vi.mocked(findUnrecognisedLocationNames).mockResolvedValue([]);

		const { dispatchStatsCacheRefreshEvents } = await import('@/modules/stats');
		vi.mocked(dispatchStatsCacheRefreshEvents).mockClear();
		vi.mocked(dispatchStatsCacheRefreshEvents).mockResolvedValue(undefined);
	});

	describe('authentication', () => {
		it('returns 401 when not authenticated', async () => {
			const { getGroupCookie } = await import('@/app/actions/group-cookie');
			vi.mocked(getGroupCookie).mockResolvedValueOnce(null);

			const request = await makeRequest(makeCsvFile([makeCsvRow()]));
			const response = await POST(request);
			expect(response.status).toBe(401);
		});
	});

	describe('request validation', () => {
		it('returns 400 when no csv file is provided', async () => {
			const formData = new FormData();
			const request = new Request('http://localhost/api/import', {
				method: 'POST',
				body: formData
			});
			const response = await POST(request);
			expect(response.status).toBe(400);
		});
	});

	describe('successful import', () => {
		beforeEach(async () => {
			const { processEncounterRow } = await import('@/lib/demon-import');
			vi.mocked(processEncounterRow).mockResolvedValue({
				visitDate: '2024-06-01'
			});
		});

		it('calls processEncounterRow for each CSV row', async () => {
			const { processEncounterRow } = await import('@/lib/demon-import');
			const file = makeCsvFile([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B654321' })
			]);
			const response = await POST(await makeRequest(file));
			await readStreamMessages(response);
			expect(vi.mocked(processEncounterRow)).toHaveBeenCalledTimes(2);
		});

		it('streams a complete message with correct counts', async () => {
			const file = makeCsvFile([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B654321' })
			]);
			const response = await POST(await makeRequest(file));
			const messages = await readStreamMessages(response);
			const complete = messages.find((m) => m.type === 'complete');
			expect(complete).toEqual({
				type: 'complete',
				processed: 2,
				successful: 2,
				failed: 0,
				skipped: 0
			});
		});

		it('streams progress every 10 rows', async () => {
			const rows = Array.from({ length: 25 }, (_, i) =>
				makeCsvRow({ ring_no: `R${i.toString().padStart(6, '0')}` })
			);
			const response = await POST(await makeRequest(makeCsvFile(rows)));
			const messages = await readStreamMessages(response);
			const progressMessages = messages.filter((m) => m.type === 'progress');
			expect(progressMessages).toHaveLength(2);
			expect(progressMessages[0]).toEqual({ type: 'progress', processed: 10 });
			expect(progressMessages[1]).toEqual({ type: 'progress', processed: 20 });
		});

		it('sets response Content-Type to application/x-ndjson', async () => {
			const response = await POST(
				await makeRequest(makeCsvFile([makeCsvRow()]))
			);
			await readStreamMessages(response);
			expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');
		});
	});

	describe('unrecognised location names', () => {
		beforeEach(async () => {
			// The shared module mock isn't auto-reset between tests, so clear the
			// call history these tests assert on.
			const { processEncounterRow, EncounterRowBatchWriter } =
				await import('@/lib/demon-import');
			vi.mocked(EncounterRowBatchWriter).mockClear();
			vi.mocked(processEncounterRow).mockClear();
			vi.mocked(processEncounterRow).mockResolvedValue({
				visitDate: '2024-06-01'
			});
		});

		it('streams an unrecognised_locations message listing the names, instead of processing any rows', async () => {
			const { findUnrecognisedLocationNames } =
				await import('@/lib/demon-import');
			vi.mocked(findUnrecognisedLocationNames).mockResolvedValue([
				'CES972',
				'Reedbed'
			]);

			const file = makeCsvFile([
				makeCsvRow({ loc_id: 'CES972' }),
				makeCsvRow({ ring_no: 'B654321', loc_id: 'Reedbed' })
			]);
			const response = await POST(await makeRequest(file));
			const messages = await readStreamMessages(response);

			expect(messages).toEqual([
				{ type: 'unrecognised_locations', locations: ['CES972', 'Reedbed'] }
			]);
		});

		it('constructs no domain-table writer and processes no rows when aborting for unrecognised locations', async () => {
			const {
				findUnrecognisedLocationNames,
				EncounterRowBatchWriter,
				processEncounterRow
			} = await import('@/lib/demon-import');
			vi.mocked(findUnrecognisedLocationNames).mockResolvedValue(['CES972']);

			const response = await POST(
				await makeRequest(makeCsvFile([makeCsvRow({ loc_id: 'CES972' })]))
			);
			await readStreamMessages(response);

			expect(vi.mocked(EncounterRowBatchWriter)).not.toHaveBeenCalled();
			expect(vi.mocked(processEncounterRow)).not.toHaveBeenCalled();
		});

		it('proceeds with normal row processing when every loc_id already matches an existing Location', async () => {
			const { findUnrecognisedLocationNames, processEncounterRow } =
				await import('@/lib/demon-import');

			const file = makeCsvFile([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B654321' })
			]);
			const response = await POST(await makeRequest(file));
			const messages = await readStreamMessages(response);

			expect(vi.mocked(findUnrecognisedLocationNames)).toHaveBeenCalledWith(
				expect.anything(),
				['Garden Trap'],
				1
			);
			expect(vi.mocked(processEncounterRow)).toHaveBeenCalledTimes(2);
			expect(messages.find((m) => m.type === 'complete')).toEqual({
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
			const { processEncounterRow } = await import('@/lib/demon-import');
			vi.mocked(processEncounterRow)
				.mockResolvedValueOnce({ visitDate: '2024-06-01' })
				.mockRejectedValueOnce(new Error('DB error'))
				.mockResolvedValueOnce({ visitDate: '2024-06-02' });

			const file = makeCsvFile([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B000001' }),
				makeCsvRow({ ring_no: 'C000001' })
			]);
			const response = await POST(await makeRequest(file));
			const messages = await readStreamMessages(response);
			const complete = messages.find((m) => m.type === 'complete');
			expect(complete).toEqual({
				type: 'complete',
				processed: 3,
				successful: 2,
				failed: 1,
				skipped: 0
			});
		});

		it('counts a CasualtyEncounterError row as skipped, not failed', async () => {
			const { processEncounterRow, CasualtyEncounterError } =
				await import('@/lib/demon-import');
			vi.mocked(processEncounterRow)
				.mockResolvedValueOnce({ visitDate: '2024-06-01' })
				.mockRejectedValueOnce(new CasualtyEncounterError());

			const file = makeCsvFile([makeCsvRow(), makeCsvRow({ ring_no: '' })]);
			const response = await POST(await makeRequest(file));
			const messages = await readStreamMessages(response);
			const complete = messages.find((m) => m.type === 'complete');
			expect(complete).toEqual({
				type: 'complete',
				processed: 2,
				successful: 1,
				failed: 0,
				skipped: 1
			});
		});

		it('streams an error message when csv-parser emits an error', async () => {
			// Trigger the outer catch in the ReadableStream start function by making
			// csv-parser emit an error. Per-row errors are caught individually and
			// counted as failures; only errors from the parsing step itself reach
			// the outer catch and produce an error NDJSON message.
			vi.doMock('csv-parser', () => ({
				default: () => {
					return new Transform({
						objectMode: true,
						transform(
							_chunk: unknown,
							_enc: string,
							callback: (err?: Error) => void
						) {
							callback(new Error('CSV parse error'));
						}
					});
				}
			}));
			vi.resetModules();

			// Re-apply mocks cleared by resetModules
			vi.doMock('@/app/lib/auth/group-auth', () => ({
				getAuthenticatedSupabaseClient: vi.fn().mockResolvedValue({})
			}));
			// This doMock replaces the file-level vi.mock registration for every
			// later import too, so it has to mock the same exports — otherwise the
			// tests after this one get the real ones back and the beforeEach above
			// fails trying to stub them.
			vi.doMock('@/lib/demon-import', async (importOriginal) => {
				const actual =
					await importOriginal<typeof import('@/lib/demon-import')>();
				return {
					...actual,
					DemonRecordsBatchWriter: vi.fn(function () {
						return {
							writeDemonRecord: vi.fn(),
							flushRemaining: vi.fn(),
							getDistinctDates: vi.fn(() => [])
						};
					}),
					EncounterRowBatchWriter: vi.fn(function () {
						return {
							writeEncounterRow: vi.fn(),
							flushRemaining: vi.fn(),
							getDistinctSpeciesIds: vi.fn(() => [])
						};
					}),
					ImportJobTracker: vi.fn(function () {
						return {
							createImportJob: vi.fn().mockResolvedValue(IMPORT_JOB_ID),
							recordAffectedDates: vi.fn(),
							completeImportJob: vi.fn(),
							failImportJob: vi.fn(),
							markImportJobTimedOut: vi.fn(),
							markStatsCacheRefreshed: vi.fn()
						};
					}),
					processEncounterRow: vi.fn(),
					findUnrecognisedLocationNames: vi.fn()
				};
			});

			const { POST: freshPOST } = await import('../route');
			const file = makeCsvFile([makeCsvRow()]);
			const response = await freshPOST(await makeRequest(file));
			const messages = await readStreamMessages(response);
			expect(messages.some((m) => m.type === 'error')).toBe(true);

			// `vi.doMock` persists past the test that registered it, and an
			// always-erroring CSV parser would break every test declared after this
			// one. (The demon-import doMock above is shape-compatible with the
			// file-level one, so that one can safely stay.)
			vi.doUnmock('csv-parser');
		});
	});

	describe('chunked domain-table writing', () => {
		it('builds the domain-table writer for the run’s group and job, and flushes its trailing chunk', async () => {
			const { EncounterRowBatchWriter, processEncounterRow } =
				await import('@/lib/demon-import');
			vi.mocked(processEncounterRow).mockResolvedValue({
				visitDate: '2024-06-01'
			});

			const file = makeCsvFile([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B000001' })
			]);
			await readStreamMessages(await POST(await makeRequest(file)));

			// Group ID 1 — group-cookie is mocked globally in vitest.setup.tsx.
			expect(vi.mocked(EncounterRowBatchWriter)).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					ringingGroupId: 1,
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

	// The fourth exit branch — the 280s timeout — isn't provoked here: it needs the
	// real deadline to pass. `markImportJobTimedOut` itself is covered in
	// lib/__tests__/demon-import.test.ts.
	describe('ImportJobs tracking', () => {
		it('opens a job for the group and completes it with the counts it reported', async () => {
			const { processEncounterRow } = await import('@/lib/demon-import');
			vi.mocked(processEncounterRow).mockResolvedValue({
				visitDate: '2024-06-01'
			});

			const file = makeCsvFile([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B000001' })
			]);
			await readStreamMessages(await POST(await makeRequest(file)));

			// Group ID 1 — group-cookie is mocked globally in vitest.setup.tsx.
			expect(mockImportJobTracker.createImportJob).toHaveBeenCalledWith(1);
			expect(mockImportJobTracker.completeImportJob).toHaveBeenCalledWith(
				IMPORT_JOB_ID,
				{ processed: 2, successful: 2, failed: 0, skipped: 0 }
			);
		});

		it('records the staged dates once every DemonRecords batch has landed', async () => {
			const { DemonRecordsBatchWriter, processEncounterRow } =
				await import('@/lib/demon-import');
			vi.mocked(processEncounterRow).mockResolvedValue({
				visitDate: '2024-06-01'
			});

			const file = makeCsvFile([
				makeCsvRow(),
				makeCsvRow({ ring_no: 'B000001' })
			]);
			await readStreamMessages(await POST(await makeRequest(file)));

			// Group ID 1 — group-cookie is mocked globally in vitest.setup.tsx.
			expect(vi.mocked(DemonRecordsBatchWriter)).toHaveBeenCalledWith(
				expect.anything(),
				{ importJobId: IMPORT_JOB_ID, ringingGroupId: 1 }
			);
			expect(mockDemonRecordsBatchWriter.flushRemaining).toHaveBeenCalledTimes(
				1
			);
			expect(mockImportJobTracker.recordAffectedDates).toHaveBeenCalledWith(
				IMPORT_JOB_ID,
				STAGED_DATES
			);
		});

		it('opens no job at all when aborting for unrecognised locations', async () => {
			const { findUnrecognisedLocationNames } =
				await import('@/lib/demon-import');
			vi.mocked(findUnrecognisedLocationNames).mockResolvedValue(['CES972']);

			const file = makeCsvFile([makeCsvRow({ loc_id: 'CES972' })]);
			await readStreamMessages(await POST(await makeRequest(file)));

			// Opening one first would leave an orphan 'in_progress' row behind for an
			// upload that wrote nothing (#1079's zero-write guarantee).
			expect(mockImportJobTracker.createImportJob).not.toHaveBeenCalled();
		});

		it('marks the job failed with the error message when the run throws', async () => {
			const { EncounterRowBatchWriter } = await import('@/lib/demon-import');
			// Thrown after the job row has been opened — unlike a CSV parse error,
			// which happens before there is anything to mark.
			vi.mocked(EncounterRowBatchWriter).mockImplementation(function () {
				throw new Error('could not build writers');
			} as never);

			const file = makeCsvFile([makeCsvRow()]);
			const messages = await readStreamMessages(
				await POST(await makeRequest(file))
			);

			expect(messages).toContainEqual({
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

	describe('stats-cache-refresh-window dispatch', () => {
		it("dispatches the run's affected dates and touched species for the group, after the job is marked succeeded", async () => {
			const { dispatchStatsCacheRefreshEvents } =
				await import('@/modules/stats');

			const file = makeCsvFile([makeCsvRow()]);
			await readStreamMessages(await POST(await makeRequest(file)));

			// Group ID 1 — group-cookie is mocked globally in vitest.setup.tsx.
			expect(dispatchStatsCacheRefreshEvents).toHaveBeenCalledTimes(1);
			expect(dispatchStatsCacheRefreshEvents).toHaveBeenCalledWith(
				IMPORT_JOB_ID,
				1,
				STAGED_DATES,
				TOUCHED_SPECIES_IDS
			);

			// Ordering: dispatch happens only after the job is marked succeeded.
			const completeOrder =
				mockImportJobTracker.completeImportJob.mock.invocationCallOrder[0];
			const dispatchOrder = vi.mocked(dispatchStatsCacheRefreshEvents).mock
				.invocationCallOrder[0];
			expect(dispatchOrder).toBeGreaterThan(completeOrder);
		});

		it('does not dispatch any events when the run times out', async () => {
			const { EncounterRowBatchWriter, processEncounterRow } =
				await import('@/lib/demon-import');
			const { dispatchStatsCacheRefreshEvents } =
				await import('@/modules/stats');

			// Captured so the test can trigger the real (unmocked)
			// `ImportDeadlineExceededError` the route closes over internally —
			// `instanceof` only recognises that exact class reference, so this is
			// the only way to provoke the timeout branch without waiting out the
			// real 280s deadline.
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
			// (rather than ticking on real wall-clock time), so the route's
			// deadline computation and the later deadline check can be put on
			// either side of an explicit jump with no dependence on how many
			// incidental `Date.now()` calls (p-ratelimit's own bookkeeping,
			// `happy-dom`'s `File`, console interception, etc.) happen in between.
			vi.useFakeTimers();

			vi.mocked(processEncounterRow).mockImplementation(async () => {
				// Past the route's 280s deadline, which was computed against the
				// frozen "now" in place before this jump.
				vi.setSystemTime(Date.now() + 281_000);
				await capturedLimitChunkFlush!(async () => {});
				return { visitDate: '2024-06-01' };
			});

			const file = makeCsvFile([makeCsvRow()]);
			const messages = await readStreamMessages(
				await POST(await makeRequest(file))
			);
			vi.useRealTimers();

			expect(messages.some((m) => m.type === 'timeout')).toBe(true);
			expect(dispatchStatsCacheRefreshEvents).not.toHaveBeenCalled();
		});

		it('does not dispatch any events when the run fails before completion', async () => {
			const { EncounterRowBatchWriter } = await import('@/lib/demon-import');
			const { dispatchStatsCacheRefreshEvents } =
				await import('@/modules/stats');
			vi.mocked(EncounterRowBatchWriter).mockImplementation(function () {
				throw new Error('could not build writers');
			} as never);

			const file = makeCsvFile([makeCsvRow()]);
			const messages = await readStreamMessages(
				await POST(await makeRequest(file))
			);

			expect(messages).toContainEqual({
				type: 'error',
				message: 'could not build writers'
			});
			expect(dispatchStatsCacheRefreshEvents).not.toHaveBeenCalled();
		});
	});
});
