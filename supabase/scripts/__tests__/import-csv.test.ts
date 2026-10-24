import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pRateLimit } from 'p-ratelimit';
import {
	DemonRecordsBatchWriter,
	EncounterRowBatchWriter,
	CasualtyEncounterError,
	findUnrecognisedLocationNames,
	getDistinctLocationNames,
	processEncounterRow,
	dispatchStatsCacheRefreshEvents
} from '../../../lib/demon-import';
import {
	createRowLimiter,
	DEFAULT_IMPORT_CONCURRENCY,
	importCSV,
	runRows
} from '../import-csv';

// Spy on the real rate limiter rather than replacing it, so the same test file
// can assert both *how* it's constructed and that it genuinely limits
// concurrency.
vi.mock('p-ratelimit', async (importOriginal) => {
	const actual = await importOriginal<typeof import('p-ratelimit')>();
	return { ...actual, pRateLimit: vi.fn(actual.pRateLimit) };
});

const csvRows = [{ ring: 'AAA001' }, { ring: 'AAA002' }];

vi.mock('fs', () => ({
	default: {
		existsSync: vi.fn(() => true),
		// `importCSV` does `fs.createReadStream(path).pipe(csvParser())`; the
		// parser is mocked to a pass-through, so `.pipe()` just has to hand back
		// an async-iterable row source.
		createReadStream: vi.fn(() => ({
			pipe: () => Readable.from(csvRows)
		}))
	}
}));

vi.mock('csv-parser', () => ({ default: vi.fn(() => ({})) }));

vi.mock('../../../lib/supabase', () => ({
	supabase: {
		from: () => ({
			select: () => ({
				eq: () => ({
					maybeSingle: async () => ({ data: { id: 7 }, error: null })
				})
			})
		})
	}
}));

vi.mock('../../../app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClientForGroup: vi.fn(async () => ({}))
}));

const IMPORT_JOB_ID = 42;

// Hoisted so the `vi.mock` factory below (which is hoisted too) can return the same
// object the tests assert against.
const {
	mockImportJobTracker,
	mockDemonRecordsBatchWriter,
	mockEncounterRowBatchWriter
} = vi.hoisted(() => ({
	mockImportJobTracker: {
		createImportJob: vi.fn(),
		recordAffectedDates: vi.fn(),
		completeImportJob: vi.fn(),
		failImportJob: vi.fn(),
		markImportJobTimedOut: vi.fn(),
		markStatsCacheRefreshed: vi.fn()
	},
	mockDemonRecordsBatchWriter: {
		writeDemonRecord: vi.fn(),
		flushRemaining: vi.fn(),
		getDistinctDates: vi.fn()
	},
	mockEncounterRowBatchWriter: {
		writeEncounterRow: vi.fn(),
		flushRemaining: vi.fn()
	}
}));

vi.mock('../../../lib/demon-import', () => ({
	createRingSequenceLookup: vi.fn(() => vi.fn()),
	createRingSequenceLinker: vi.fn(() => vi.fn()),
	// `function`, not an arrow, for all three of these: the script does `new
	// DemonRecordsBatchWriter(...)`/`new EncounterRowBatchWriter(...)`/`new
	// ImportJobTracker(...)`, and only a newable stub's returned object becomes
	// the constructed instance.
	DemonRecordsBatchWriter: vi.fn(function () {
		return mockDemonRecordsBatchWriter;
	}),
	EncounterRowBatchWriter: vi.fn(function () {
		return mockEncounterRowBatchWriter;
	}),
	ImportJobTracker: vi.fn(function () {
		return mockImportJobTracker;
	}),
	processEncounterRow: vi.fn(async () => {}),
	CasualtyEncounterError: class CasualtyEncounterError extends Error {},
	getDistinctLocationNames: vi.fn(() => ['Garden Trap']),
	// Every location in the CSV is already known unless a test says otherwise.
	findUnrecognisedLocationNames: vi.fn(async () => [] as string[]),
	dispatchStatsCacheRefreshEvents: vi.fn(async () => {})
}));

const mockedPRateLimit = vi.mocked(pRateLimit);

beforeEach(() => {
	mockedPRateLimit.mockClear();
	vi.mocked(processEncounterRow).mockClear();
	// Re-stated rather than just cleared: a test that swaps the implementation out
	// (to observe call ordering) must not leak it into the tests after it.
	vi.mocked(processEncounterRow).mockImplementation(async () => ({
		visitDate: '2024-06-01'
	}));
	vi.mocked(findUnrecognisedLocationNames).mockClear();
	vi.mocked(findUnrecognisedLocationNames).mockResolvedValue([]);
	vi.mocked(getDistinctLocationNames).mockReturnValue(['Garden Trap']);
	for (const trackerOperation of Object.values(mockImportJobTracker)) {
		trackerOperation.mockReset();
		trackerOperation.mockResolvedValue(undefined);
	}
	mockImportJobTracker.createImportJob.mockResolvedValue(IMPORT_JOB_ID);
	vi.mocked(DemonRecordsBatchWriter).mockClear();
	for (const writerOperation of Object.values(mockDemonRecordsBatchWriter)) {
		writerOperation.mockClear();
	}
	mockDemonRecordsBatchWriter.writeDemonRecord.mockResolvedValue(undefined);
	mockDemonRecordsBatchWriter.flushRemaining.mockResolvedValue(undefined);
	mockDemonRecordsBatchWriter.getDistinctDates.mockReturnValue(['2024-06-01']);
	vi.mocked(EncounterRowBatchWriter).mockClear();
	for (const writerOperation of Object.values(mockEncounterRowBatchWriter)) {
		writerOperation.mockClear();
	}
	mockEncounterRowBatchWriter.writeEncounterRow.mockResolvedValue({
		visitDate: '2024-06-01'
	});
	mockEncounterRowBatchWriter.flushRemaining.mockResolvedValue(undefined);

	vi.mocked(dispatchStatsCacheRefreshEvents).mockClear();
	vi.mocked(dispatchStatsCacheRefreshEvents).mockResolvedValue(undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('module import safety', () => {
	it('does not parse argv or call process.exit when imported for its exports', async () => {
		const exitSpy = vi
			.spyOn(process, 'exit')
			.mockImplementation(() => undefined as never);
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const originalArgv = process.argv;
		// No CSV path / group name — the CLI block would print usage and exit if
		// it ran on import.
		process.argv = ['node', '/somewhere/else/vitest-entrypoint.js'];

		vi.resetModules();
		const moduleExports = await import('../import-csv');

		process.argv = originalArgv;

		expect(typeof moduleExports.importCSV).toBe('function');
		expect(exitSpy).not.toHaveBeenCalled();
		expect(logSpy).not.toHaveBeenCalledWith(
			expect.stringContaining('Usage: npm run db:import')
		);
	});
});

describe('importCSV concurrency option', () => {
	it('constructs the rate limiter with concurrency 30 when no option is passed', async () => {
		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha'
		});

		expect(DEFAULT_IMPORT_CONCURRENCY).toBe(30);
		expect(mockedPRateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ concurrency: 30 })
		);
	});

	it('constructs the rate limiter with the given concurrency value', async () => {
		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha',
			concurrency: 1
		});

		expect(mockedPRateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ concurrency: 1 })
		);
	});
});

describe('importCSV unrecognised location names', () => {
	it('exits non-zero and prints the unrecognised names without processing any rows', async () => {
		// `process.exit` never returns in production, so the spy throws rather
		// than letting `importCSV` fall through into row processing.
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
			throw new Error(`process.exit(${code})`);
		});
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(findUnrecognisedLocationNames).mockResolvedValue([
			'CES972',
			'Reedbed'
		]);

		await expect(
			importCSV({ csvFilePath: '/fake/alpha.csv', ringingGroupName: 'Alpha' })
		).rejects.toThrow('process.exit(1)');

		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining('CES972, Reedbed')
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(vi.mocked(processEncounterRow)).not.toHaveBeenCalled();
		// The job row is opened after the pre-flight precisely so an aborted import
		// stays a complete no-op, rather than leaving an orphan 'in_progress' row.
		expect(mockImportJobTracker.createImportJob).not.toHaveBeenCalled();
	});

	it('proceeds with the existing row-processing behaviour when every loc_id is already known', async () => {
		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha'
		});

		expect(vi.mocked(findUnrecognisedLocationNames)).toHaveBeenCalledWith(
			expect.anything(),
			['Garden Trap'],
			7
		);
		expect(vi.mocked(processEncounterRow)).toHaveBeenCalledTimes(
			csvRows.length
		);
	});
});

describe('importCSV ImportJobs tracking', () => {
	it('opens a job for the group and completes it with the run’s row counts', async () => {
		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha'
		});

		expect(mockImportJobTracker.createImportJob).toHaveBeenCalledWith(7);
		// `runRows`' totalRecords/successfulRecords/failedRecords/skippedRecords,
		// renamed onto the processed/successful/failed/skipped shape the column
		// names (bar skipped, which isn't persisted) use.
		expect(mockImportJobTracker.completeImportJob).toHaveBeenCalledWith(
			IMPORT_JOB_ID,
			{
				processed: csvRows.length,
				successful: csvRows.length,
				failed: 0,
				skipped: 0
			}
		);
		expect(mockImportJobTracker.failImportJob).not.toHaveBeenCalled();
	});

	it('counts a CasualtyEncounterError row as skipped rather than failed, and logs it accordingly', async () => {
		const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.mocked(processEncounterRow)
			.mockResolvedValueOnce({ visitDate: '2024-06-01' })
			.mockRejectedValueOnce(new CasualtyEncounterError());

		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha'
		});

		expect(mockImportJobTracker.completeImportJob).toHaveBeenCalledWith(
			IMPORT_JOB_ID,
			{ processed: 2, successful: 1, failed: 0, skipped: 1 }
		);
		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				'casualties to unringed birds are not yet supported in totf'
			)
		);
	});

	it('prints a Skipped: N line alongside the existing summary lines', async () => {
		const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.mocked(processEncounterRow)
			.mockResolvedValueOnce({ visitDate: '2024-06-01' })
			.mockRejectedValueOnce(new CasualtyEncounterError());

		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha'
		});

		expect(consoleLogSpy).toHaveBeenCalledWith('Skipped: 1');
	});

	it('marks the job failed and re-raises when the run throws systemically', async () => {
		// Per-row failures are absorbed into failedRecords, so this stands in for a
		// systemic failure of the whole run rather than one bad row.
		mockDemonRecordsBatchWriter.flushRemaining.mockRejectedValue(
			new Error('staging flush exploded')
		);

		await expect(
			importCSV({ csvFilePath: '/fake/alpha.csv', ringingGroupName: 'Alpha' })
		).rejects.toThrow('staging flush exploded');

		expect(mockImportJobTracker.failImportJob).toHaveBeenCalledWith(
			IMPORT_JOB_ID,
			'staging flush exploded'
		);
		expect(mockImportJobTracker.completeImportJob).not.toHaveBeenCalled();
	});
});

describe('importCSV DemonRecords staging', () => {
	it('stages every row for the run’s job and group, then records the staged dates', async () => {
		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha'
		});

		expect(vi.mocked(DemonRecordsBatchWriter)).toHaveBeenCalledWith(
			expect.anything(),
			{ importJobId: IMPORT_JOB_ID, ringingGroupId: 7 }
		);
		expect(mockDemonRecordsBatchWriter.flushRemaining).toHaveBeenCalledTimes(1);
		expect(mockImportJobTracker.recordAffectedDates).toHaveBeenCalledWith(
			IMPORT_JOB_ID,
			['2024-06-01']
		);
	});

	it('flushes the trailing batch before awaiting any row’s domain-table write', async () => {
		// The buffer only holds exactly the trailing partial batch at the moment
		// every row has been dispatched and none awaited — so a flush that happened
		// after the rows had been awaited could deadlock on a batch that can no
		// longer fill.
		const callOrder: string[] = [];
		mockDemonRecordsBatchWriter.flushRemaining.mockImplementation(async () => {
			callOrder.push('flushRemaining');
		});
		vi.mocked(processEncounterRow).mockImplementation(async () => {
			callOrder.push('processEncounterRow');
		});

		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha'
		});

		expect(callOrder).toEqual([
			'processEncounterRow',
			'processEncounterRow',
			'flushRemaining'
		]);
	});
});

describe('importCSV chunked domain-table writing', () => {
	it('builds the domain-table writer for the group and job, with the run’s rate limiter capping chunk flushes', async () => {
		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha',
			concurrency: 5
		});

		expect(vi.mocked(EncounterRowBatchWriter)).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				ringingGroupId: 7,
				importJobId: IMPORT_JOB_ID,
				limitChunkFlush: expect.any(Function)
			})
		);
		expect(mockedPRateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ concurrency: 5 })
		);
	});

	it('flushes the trailing chunk once every row has been dispatched, before any row is awaited', async () => {
		// A row's promise is what settles when its chunk lands, so `runRows`'
		// `Promise.all` over the rows would deadlock on the trailing chunk if the
		// flush ran after it rather than in `onAllRowsDispatched`.
		const callOrder: string[] = [];
		mockEncounterRowBatchWriter.flushRemaining.mockImplementation(async () => {
			callOrder.push('flushRemaining');
		});
		vi.mocked(processEncounterRow).mockImplementation(async () => {
			callOrder.push('processEncounterRow');
		});

		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha'
		});

		expect(callOrder).toEqual([
			'processEncounterRow',
			'processEncounterRow',
			'flushRemaining'
		]);
	});
});

describe('stats-cache-refresh dispatch', () => {
	// Event-building, per-event dispatch and dispatch-failure handling are
	// `dispatchStatsCacheRefreshEvents`'s own responsibility, unit-tested in
	// `lib/__tests__/demon-import.test.ts`. This only has to prove the script
	// calls it with the run's own ids/dates/log-context, after the job is
	// marked complete.
	it('calls dispatchStatsCacheRefreshEvents with the run’s ids, affected dates and CLI log context, after completeImportJob', async () => {
		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha'
		});

		expect(dispatchStatsCacheRefreshEvents).toHaveBeenCalledWith(
			IMPORT_JOB_ID,
			7,
			['2024-06-01'],
			{ csvFilePath: '/fake/alpha.csv', ringingGroupName: 'Alpha' }
		);

		// Dispatch happens only after the job is marked complete.
		const completeOrder =
			mockImportJobTracker.completeImportJob.mock.invocationCallOrder[0];
		const dispatchOrder = vi.mocked(dispatchStatsCacheRefreshEvents).mock
			.invocationCallOrder[0];
		expect(dispatchOrder).toBeGreaterThan(completeOrder);
	});
});

describe('createRowLimiter', () => {
	/**
	 * Fake domain-table write that records the highest number of simultaneously
	 * in-flight calls it ever saw.
	 */
	function trackingWrite() {
		let inFlight = 0;
		let maxInFlight = 0;
		const write = async () => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 20));
			inFlight--;
		};
		return { write, getMaxInFlight: () => maxInFlight };
	}

	it('never runs two writes concurrently when concurrency is 1', async () => {
		const { write, getMaxInFlight } = trackingWrite();
		const limit = createRowLimiter(1);

		await Promise.all([1, 2, 3, 4, 5].map(() => limit(write)));

		expect(getMaxInFlight()).toBe(1);
	});

	it('allows up to N concurrent writes when concurrency is N>1', async () => {
		const { write, getMaxInFlight } = trackingWrite();
		const limit = createRowLimiter(5);

		await Promise.all([1, 2, 3, 4, 5].map(() => limit(write)));

		expect(getMaxInFlight()).toBeGreaterThan(1);
		expect(getMaxInFlight()).toBeLessThanOrEqual(5);
	});
});

describe('runRows', () => {
	it('counts every row, splitting successes from the ones that threw', async () => {
		const counts = await runRows([1, 2, 3, 4, 5], async (row) => {
			if (row === 3) throw new Error('bad row');
		});

		expect(counts).toEqual({
			totalRecords: 5,
			successfulRecords: 4,
			failedRecords: 1,
			skippedRecords: 0
		});
	});

	it('counts a row whose rejection matches isSkippable as skipped, not failed', async () => {
		class SkippableError extends Error {}
		const counts = await runRows(
			[1, 2, 3],
			async (row) => {
				if (row === 2) throw new SkippableError();
			},
			undefined,
			(err) => err instanceof SkippableError
		);

		expect(counts).toEqual({
			totalRecords: 3,
			successfulRecords: 2,
			failedRecords: 0,
			skippedRecords: 1
		});
	});

	it('logs a skip message naming the row position, rather than the raw error, for a skippable rejection', async () => {
		const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		class SkippableError extends Error {}

		await runRows(
			[1, 2],
			async (row) => {
				if (row === 2) throw new SkippableError('raw error message');
			},
			undefined,
			(err) => err instanceof SkippableError
		);

		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				'casualties to unringed birds are not yet supported in totf'
			)
		);
		expect(consoleLogSpy).not.toHaveBeenCalledWith(
			expect.objectContaining({ message: 'raw error message' })
		);
	});

	it('falls back to counting every rejection as failed when no isSkippable predicate is given', async () => {
		const counts = await runRows([1, 2], async (row) => {
			if (row === 2) throw new Error('bad row');
		});

		expect(counts).toEqual({
			totalRecords: 2,
			successfulRecords: 1,
			failedRecords: 1,
			skippedRecords: 0
		});
	});

	it('runs onAllRowsDispatched after every row is dispatched but before any has settled', async () => {
		const settledRows: number[] = [];
		let rowsSettledWhenDispatchCompleted = -1;

		await runRows(
			[1, 2, 3],
			async (row: number) => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				settledRows.push(row);
			},
			async () => {
				rowsSettledWhenDispatchCompleted = settledRows.length;
			}
		);

		expect(rowsSettledWhenDispatchCompleted).toBe(0);
		expect(settledRows).toEqual([1, 2, 3]);
	});
});
