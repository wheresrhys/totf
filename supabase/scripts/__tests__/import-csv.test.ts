import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemonImportUpdate } from '@/modules/demon-import';
import { importCSV } from '../import-csv';

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

const { mockGroupSupabaseClient } = vi.hoisted(() => ({
	mockGroupSupabaseClient: { marker: 'group-client' }
}));

vi.mock('../../../app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClientForGroup: vi.fn(
		async () => mockGroupSupabaseClient
	)
}));

const { mockRunDemonImport } = vi.hoisted(() => ({
	mockRunDemonImport: vi.fn()
}));

vi.mock('@/modules/demon-import', () => ({
	runDemonImport: mockRunDemonImport,
	DEFAULT_IMPORT_CONCURRENCY: 30
}));

async function* canned(
	updates: DemonImportUpdate[]
): AsyncGenerator<DemonImportUpdate> {
	for (const update of updates) yield update;
}

beforeEach(() => {
	mockRunDemonImport.mockReset();
	mockRunDemonImport.mockReturnValue(
		canned([
			{
				type: 'complete',
				processed: 2,
				successful: 2,
				failed: 0,
				skipped: 0
			}
		])
	);
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

describe('importCSV', () => {
	it('calls runDemonImport with the materialized rows, resolved group client/id, default concurrency and log context', async () => {
		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha'
		});

		expect(mockRunDemonImport).toHaveBeenCalledWith({
			supabaseClient: mockGroupSupabaseClient,
			ringingGroupId: 7,
			source: csvRows,
			concurrency: 30,
			logContext: { csvFilePath: '/fake/alpha.csv', ringingGroupName: 'Alpha' }
		});
	});

	it('passes a given concurrency value straight through to runDemonImport', async () => {
		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha',
			concurrency: 1
		});

		expect(mockRunDemonImport).toHaveBeenCalledWith(
			expect.objectContaining({ concurrency: 1 })
		);
	});
});

describe('importCSV update handling', () => {
	it('exits non-zero and prints the unrecognised names, consuming no further updates', async () => {
		// `process.exit` never returns in production, so the spy throws rather
		// than letting `importCSV` fall through into the next switch case.
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
			throw new Error(`process.exit(${code})`);
		});
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mockRunDemonImport.mockReturnValue(
			canned([
				{
					type: 'unrecognised_locations',
					locations: ['CES972', 'Reedbed']
				}
			])
		);

		await expect(
			importCSV({ csvFilePath: '/fake/alpha.csv', ringingGroupName: 'Alpha' })
		).rejects.toThrow('process.exit(1)');

		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining('CES972, Reedbed')
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('prints the completion summary, including a non-zero Skipped line', async () => {
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		mockRunDemonImport.mockReturnValue(
			canned([
				{
					type: 'complete',
					processed: 3,
					successful: 2,
					failed: 0,
					skipped: 1
				}
			])
		);

		await importCSV({
			csvFilePath: '/fake/alpha.csv',
			ringingGroupName: 'Alpha'
		});

		expect(logSpy).toHaveBeenCalledWith('Total records: 3');
		expect(logSpy).toHaveBeenCalledWith('Successful: 2');
		expect(logSpy).toHaveBeenCalledWith('Failed: 0');
		expect(logSpy).toHaveBeenCalledWith('Skipped: 1');
	});

	it('rejects with the update’s message when the run yields an error update', async () => {
		mockRunDemonImport.mockReturnValue(
			canned([{ type: 'error', message: 'staging flush exploded' }])
		);

		await expect(
			importCSV({ csvFilePath: '/fake/alpha.csv', ringingGroupName: 'Alpha' })
		).rejects.toThrow('staging flush exploded');
	});
});
