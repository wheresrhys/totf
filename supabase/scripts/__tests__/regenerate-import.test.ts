import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEMON_RECORDS_PAGE_SIZE,
	fetchDemonRows,
	regenerateImport
} from '../regenerate-import';

const {
	mockRunImport,
	mockRingingGroupsMaybeSingle,
	mockGetAuthenticatedSupabaseClientForGroup
} = vi.hoisted(() => ({
	mockRunImport: vi.fn(async () => {}),
	mockRingingGroupsMaybeSingle: vi.fn(),
	mockGetAuthenticatedSupabaseClientForGroup: vi.fn()
}));

vi.mock('../import-csv', () => ({
	DEFAULT_IMPORT_CONCURRENCY: 30,
	runImport: mockRunImport
}));

vi.mock('../../../lib/supabase', () => ({
	supabase: {
		from: () => ({
			select: () => ({
				eq: () => ({ maybeSingle: mockRingingGroupsMaybeSingle })
			})
		})
	}
}));

vi.mock('../../../app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClientForGroup:
		mockGetAuthenticatedSupabaseClientForGroup
}));

/**
 * Builds a fake Supabase query-builder chain over `pagesOfRows` — an array of
 * `DemonRecords` row pages. Every chain method but `.limit()` just returns
 * the same chain object; `.limit()` is where the next page is popped off and
 * returned, so tests can assert exactly how many pages `fetchDemonRows`
 * fetched and with what cursor.
 */
function buildFakeSupabaseClient(
	pagesOfRows: { id: number; raw_row: object }[][]
) {
	let pageIndex = 0;
	const chain = {
		from: vi.fn(() => chain),
		select: vi.fn(() => chain),
		eq: vi.fn(() => chain),
		gt: vi.fn(() => chain),
		order: vi.fn(() => chain),
		limit: vi.fn(async () => {
			const data = pagesOfRows[pageIndex] ?? [];
			pageIndex++;
			return { data, error: null };
		})
	};
	return chain;
}

beforeEach(() => {
	mockRunImport.mockClear();
	mockRunImport.mockResolvedValue(undefined);
	mockRingingGroupsMaybeSingle.mockReset();
	mockRingingGroupsMaybeSingle.mockResolvedValue({
		data: { group_name: 'Alpha' },
		error: null
	});
	mockGetAuthenticatedSupabaseClientForGroup.mockReset();
	mockGetAuthenticatedSupabaseClientForGroup.mockResolvedValue(
		buildFakeSupabaseClient([[]])
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
		const originalArgv = process.argv;
		process.argv = ['node', '/somewhere/else/vitest-entrypoint.js'];

		vi.resetModules();
		const moduleExports = await import('../regenerate-import');

		process.argv = originalArgv;

		expect(typeof moduleExports.regenerateImport).toBe('function');
		expect(exitSpy).not.toHaveBeenCalled();
	});
});

describe('fetchDemonRows pagination', () => {
	it('returns every row across a single page under the page size', async () => {
		const client = buildFakeSupabaseClient([
			[
				{ id: 1, raw_row: { ring_no: 'AAA001' } },
				{ id: 2, raw_row: { ring_no: 'AAA002' } }
			]
		]);

		const rows = await fetchDemonRows(client as never, 7);

		expect(rows).toEqual([{ ring_no: 'AAA001' }, { ring_no: 'AAA002' }]);
		expect(client.limit).toHaveBeenCalledTimes(1);
	});

	it('keeps fetching while a page comes back full, and stops at the first short page', async () => {
		const fullPage = Array.from(
			{ length: DEMON_RECORDS_PAGE_SIZE },
			(_, i) => ({
				id: i + 1,
				raw_row: { ring_no: `AAA${i}` }
			})
		);
		const shortPage = [
			{ id: DEMON_RECORDS_PAGE_SIZE + 1, raw_row: { ring_no: 'LAST' } }
		];
		const client = buildFakeSupabaseClient([fullPage, shortPage]);

		const rows = await fetchDemonRows(client as never, 7);

		expect(rows).toHaveLength(DEMON_RECORDS_PAGE_SIZE + 1);
		expect(rows[rows.length - 1]).toEqual({ ring_no: 'LAST' });
		expect(client.limit).toHaveBeenCalledTimes(2);
	});

	it('keys each page off the previous page’s last id, not an offset', async () => {
		// A page exactly at the page size forces a second fetch (the loop only
		// stops on a *short* page), so the cursor used for that second fetch is
		// observable.
		const fullPage = Array.from(
			{ length: DEMON_RECORDS_PAGE_SIZE },
			(_, i) => ({
				id: (i + 1) * 10,
				raw_row: { ring_no: `AAA${i}` }
			})
		);
		const lastIdOfFirstPage = fullPage[fullPage.length - 1].id;
		const client = buildFakeSupabaseClient([fullPage, []]);

		await fetchDemonRows(client as never, 7);

		expect(client.gt).toHaveBeenNthCalledWith(1, 'id', 0);
		expect(client.gt).toHaveBeenNthCalledWith(2, 'id', lastIdOfFirstPage);
	});

	it('returns an empty array when the group has no staged rows', async () => {
		const client = buildFakeSupabaseClient([[]]);

		const rows = await fetchDemonRows(client as never, 7);

		expect(rows).toEqual([]);
	});

	it('scopes the query to the given ringing group id', async () => {
		const client = buildFakeSupabaseClient([[]]);

		await fetchDemonRows(client as never, 7);

		expect(client.eq).toHaveBeenCalledWith('ringing_group_id', 7);
	});
});

describe('regenerateImport group lookup', () => {
	it('exits non-zero and does not run the pipeline when the ringing group id is not found', async () => {
		mockRingingGroupsMaybeSingle.mockResolvedValue({ data: null, error: null });
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
			throw new Error(`process.exit(${code})`);
		});
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(regenerateImport({ ringingGroupId: 999 })).rejects.toThrow(
			'process.exit(1)'
		);

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('999'));
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(mockRunImport).not.toHaveBeenCalled();
	});
});

describe('regenerateImport fetched rows', () => {
	it('fetches the group’s staged rows and runs the shared import pipeline over them', async () => {
		mockGetAuthenticatedSupabaseClientForGroup.mockResolvedValue(
			buildFakeSupabaseClient([[{ id: 1, raw_row: { ring_no: 'AAA001' } }]])
		);

		await regenerateImport({ ringingGroupId: 7 });

		expect(mockRunImport).toHaveBeenCalledWith({
			rows: [{ ring_no: 'AAA001' }],
			ringingGroupId: 7,
			ringingGroupName: 'Alpha',
			concurrency: 30,
			logContext: { source: 'regenerate' }
		});
	});

	it('passes a given concurrency value straight through to the shared pipeline', async () => {
		mockGetAuthenticatedSupabaseClientForGroup.mockResolvedValue(
			buildFakeSupabaseClient([[{ id: 1, raw_row: { ring_no: 'AAA001' } }]])
		);

		await regenerateImport({ ringingGroupId: 7, concurrency: 1 });

		expect(mockRunImport).toHaveBeenCalledWith(
			expect.objectContaining({ concurrency: 1 })
		);
	});

	it('does not call the shared import pipeline when the group has no staged rows', async () => {
		mockGetAuthenticatedSupabaseClientForGroup.mockResolvedValue(
			buildFakeSupabaseClient([[]])
		);
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		await regenerateImport({ ringingGroupId: 7 });

		expect(mockRunImport).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining('nothing to regenerate')
		);
	});
});
