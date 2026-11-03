import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportJobRowCounts } from '../../types';
import { ImportJobTracker } from '../import-job-tracker';

describe('ImportJobTracker', () => {
	const IMPORT_JOB_ID = 42;
	const TRACKED_RINGING_GROUP_ID = 7;
	// Every timestamp the tracker writes is `new Date().toISOString()`.
	const ISO_TIMESTAMP = expect.stringMatching(
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
	);

	let mockSingle: ReturnType<typeof vi.fn>;
	let mockInsertSelect: ReturnType<typeof vi.fn>;
	let mockInsert: ReturnType<typeof vi.fn>;
	let mockEq: ReturnType<typeof vi.fn>;
	let mockUpdate: ReturnType<typeof vi.fn>;
	let mockFrom: ReturnType<typeof vi.fn>;
	let tracker: ImportJobTracker;

	/**
	 * The one payload handed to `.update()`. Asserted whole rather than per-key, so
	 * a transition touching a column it has no business touching fails the test.
	 */
	function soleUpdatePayload(): Record<string, unknown> {
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		return mockUpdate.mock.calls[0][0];
	}

	beforeEach(() => {
		mockSingle = vi
			.fn()
			.mockResolvedValue({ data: { id: IMPORT_JOB_ID }, error: null });
		mockInsertSelect = vi.fn(() => ({ single: mockSingle }));
		mockInsert = vi.fn(() => ({ select: mockInsertSelect }));
		mockEq = vi.fn().mockResolvedValue({ error: null });
		mockUpdate = vi.fn(() => ({ eq: mockEq }));
		mockFrom = vi.fn(() => ({ insert: mockInsert, update: mockUpdate }));
		tracker = new ImportJobTracker(
			// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain this test needs, not the full SupabaseClient interface
			{ from: mockFrom } as unknown as SupabaseClient
		);
	});

	describe('opening a job at the start of a run', () => {
		it('inserts an in-progress row for the group and returns its id', async () => {
			const importJobId = await tracker.createImportJob(
				TRACKED_RINGING_GROUP_ID
			);

			expect(mockFrom).toHaveBeenCalledWith('ImportJobs');
			expect(mockInsert).toHaveBeenCalledWith({
				ringing_group_id: TRACKED_RINGING_GROUP_ID,
				status: 'in_progress',
				started_at: ISO_TIMESTAMP,
				day_stats_refresh_status: 'in_progress',
				month_stats_refresh_status: 'in_progress',
				year_stats_refresh_status: 'in_progress',
				month_squashed_stats_refresh_status: 'in_progress',
				all_time_stats_refresh_status: 'in_progress'
			});
			expect(importJobId).toBe(IMPORT_JOB_ID);
		});

		it('throws when the insert fails', async () => {
			mockSingle.mockResolvedValue({
				data: null,
				error: { message: 'insert into ImportJobs denied' }
			});
			await expect(
				tracker.createImportJob(TRACKED_RINGING_GROUP_ID)
			).rejects.toMatchObject({ message: 'insert into ImportJobs denied' });
		});
	});

	describe('recording the batch’s affected dates mid-run', () => {
		it('sets the distinct dates passed in and nothing else', async () => {
			await tracker.recordAffectedDates(IMPORT_JOB_ID, [
				'2024-03-15',
				'2024-03-14',
				'2024-03-15'
			]);

			expect(soleUpdatePayload()).toEqual({
				affected_dates: ['2024-03-14', '2024-03-15']
			});
			expect(mockEq).toHaveBeenCalledWith('id', IMPORT_JOB_ID);
		});

		it('throws when the update fails', async () => {
			mockEq.mockResolvedValue({ error: { message: 'row not visible' } });
			await expect(
				tracker.recordAffectedDates(IMPORT_JOB_ID, ['2024-03-15'])
			).rejects.toMatchObject({ message: 'row not visible' });
		});
	});

	describe('completing a job', () => {
		it('sets succeeded, a finish time and the three row counts', async () => {
			await tracker.completeImportJob(IMPORT_JOB_ID, {
				processed: 10,
				successful: 9,
				failed: 1
			} as ImportJobRowCounts);

			expect(soleUpdatePayload()).toEqual({
				status: 'succeeded',
				finished_at: ISO_TIMESTAMP,
				rows_processed: 10,
				rows_successful: 9,
				rows_failed: 1
			});
		});
	});

	describe('failing a job', () => {
		it('sets failed, a finish time and the error message', async () => {
			await tracker.failImportJob(IMPORT_JOB_ID, 'connection reset');

			expect(soleUpdatePayload()).toEqual({
				status: 'failed',
				finished_at: ISO_TIMESTAMP,
				error_message: 'connection reset'
			});
		});
	});

	describe('marking a job timed out', () => {
		it('sets timed_out, a finish time and the partial progress reported', async () => {
			await tracker.markImportJobTimedOut(IMPORT_JOB_ID, {
				processed: 400,
				startDate: '2024-03-01',
				endDate: '2024-03-15'
			});

			expect(soleUpdatePayload()).toEqual({
				status: 'timed_out',
				finished_at: ISO_TIMESTAMP,
				rows_processed: 400,
				start_date: '2024-03-01',
				end_date: '2024-03-15'
			});
		});
	});

	// One test per temporal unit, varying only which unit is named — the point of
	// these columns is that each is settable without disturbing the other four or
	// the job's own `status`, which the whole-payload assertion is what proves.
	describe('recording one temporal unit’s refresh outcome', () => {
		it('records the day temporal unit on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(IMPORT_JOB_ID, 'day', 'succeeded');
			expect(soleUpdatePayload()).toEqual({
				day_stats_refresh_status: 'succeeded'
			});
		});

		it('records the month temporal unit on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(
				IMPORT_JOB_ID,
				'month',
				'succeeded'
			);
			expect(soleUpdatePayload()).toEqual({
				month_stats_refresh_status: 'succeeded'
			});
		});

		it('records the year temporal unit on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(IMPORT_JOB_ID, 'year', 'succeeded');
			expect(soleUpdatePayload()).toEqual({
				year_stats_refresh_status: 'succeeded'
			});
		});

		it('records the month-squashed temporal unit on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(
				IMPORT_JOB_ID,
				'month-squashed',
				'succeeded'
			);
			expect(soleUpdatePayload()).toEqual({
				month_squashed_stats_refresh_status: 'succeeded'
			});
		});

		it('records the all-time temporal unit on its own column alone', async () => {
			await tracker.markStatsCacheRefreshed(
				IMPORT_JOB_ID,
				'all-time',
				'succeeded'
			);
			expect(soleUpdatePayload()).toEqual({
				all_time_stats_refresh_status: 'succeeded'
			});
		});

		it('records a failed refresh the same way, leaving the job’s own status alone', async () => {
			await tracker.markStatsCacheRefreshed(IMPORT_JOB_ID, 'month', 'failed');
			expect(soleUpdatePayload()).toEqual({
				month_stats_refresh_status: 'failed'
			});
		});
	});

	describe('a zero-row import', () => {
		it('still opens and completes a job, with zero counts and no affected dates', async () => {
			const importJobId = await tracker.createImportJob(
				TRACKED_RINGING_GROUP_ID
			);
			expect(importJobId).toBe(IMPORT_JOB_ID);

			await tracker.recordAffectedDates(importJobId, []);
			expect(mockUpdate).toHaveBeenNthCalledWith(1, { affected_dates: [] });

			await tracker.completeImportJob(importJobId, {
				processed: 0,
				successful: 0,
				failed: 0
			} as ImportJobRowCounts);
			expect(mockUpdate).toHaveBeenNthCalledWith(2, {
				status: 'succeeded',
				finished_at: ISO_TIMESTAMP,
				rows_processed: 0,
				rows_successful: 0,
				rows_failed: 0
			});
		});
	});
});
