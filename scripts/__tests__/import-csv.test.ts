import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pRateLimit } from 'p-ratelimit';
import {
	DEFAULT_IMPORT_CONCURRENCY,
	importCSV,
	runRowsWithConcurrency
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

vi.mock('../../lib/supabase', () => ({
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

vi.mock('../../app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClientForGroup: vi.fn(async () => ({}))
}));

vi.mock('../../lib/demon-import', () => ({
	createUpserter: vi.fn(() => vi.fn()),
	createRingSequenceLookup: vi.fn(() => vi.fn()),
	createRingSequenceLinker: vi.fn(() => vi.fn()),
	processEncounterRow: vi.fn(async () => {})
}));

const mockedPRateLimit = vi.mocked(pRateLimit);

beforeEach(() => {
	mockedPRateLimit.mockClear();
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

describe('per-row concurrency actually serializes at concurrency: 1', () => {
	/**
	 * Fake row processor that records the highest number of simultaneously
	 * in-flight calls it ever saw.
	 */
	function trackingProcessRow() {
		let inFlight = 0;
		let maxInFlight = 0;
		const processRow = async () => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 20));
			inFlight--;
		};
		return { processRow, getMaxInFlight: () => maxInFlight };
	}

	it('never runs two processRow calls concurrently when concurrency is 1', async () => {
		const { processRow, getMaxInFlight } = trackingProcessRow();
		const rows = [1, 2, 3, 4, 5];

		const counts = await runRowsWithConcurrency(rows, 1, processRow);

		expect(getMaxInFlight()).toBe(1);
		expect(counts).toEqual({
			totalRecords: 5,
			successfulRecords: 5,
			failedRecords: 0
		});
	});

	it('allows up to N concurrent processRow calls when concurrency is N>1', async () => {
		const { processRow, getMaxInFlight } = trackingProcessRow();
		const rows = [1, 2, 3, 4, 5];

		const counts = await runRowsWithConcurrency(rows, 5, processRow);

		expect(getMaxInFlight()).toBeGreaterThan(1);
		expect(getMaxInFlight()).toBeLessThanOrEqual(5);
		expect(counts.totalRecords).toBe(5);
	});
});
