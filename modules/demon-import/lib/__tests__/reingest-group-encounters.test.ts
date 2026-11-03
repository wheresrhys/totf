import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemonImportUpdate } from '../../types';

const { mockRunDemonImport } = vi.hoisted(() => ({
	mockRunDemonImport: vi.fn()
}));

vi.mock('../run-demon-import', () => ({
	runDemonImport: mockRunDemonImport,
	DEFAULT_IMPORT_CONCURRENCY: 30
}));

beforeEach(() => {
	mockRunDemonImport.mockReset();
});

/**
 * Builds a fake Supabase query-builder chain covering both queries
 * `reingestGroupEncounters` issues against the same client: the
 * `RingingGroups` name lookup (`.maybeSingle()`) and the `DemonRecords`
 * pagination (`.limit()`). `pagesOfRows` is an array of pages; `.limit()`
 * pops the next one off each call, so tests can assert exactly how many
 * pages were fetched and with what cursor.
 */
function buildFakeSupabaseClient({
	groupName = 'Alpha',
	pagesOfRows = [[]]
}: {
	groupName?: string | null;
	pagesOfRows?: { id: number; raw_row: object }[][];
} = {}) {
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
		}),
		maybeSingle: vi.fn(async () => ({
			data: groupName === null ? null : { group_name: groupName },
			error: null
		}))
	};
	return chain;
}

async function* canned(
	updates: DemonImportUpdate[]
): AsyncGenerator<DemonImportUpdate> {
	for (const update of updates) yield update;
}

async function collect(
	generator: AsyncGenerator<DemonImportUpdate>
): Promise<DemonImportUpdate[]> {
	const updates: DemonImportUpdate[] = [];
	for await (const update of generator) updates.push(update);
	return updates;
}

describe('fetchDemonRows pagination', () => {
	it('returns every row across a single page under the page size', async () => {
		const { fetchDemonRows } = await import('../reingest-group-encounters');
		const client = buildFakeSupabaseClient({
			pagesOfRows: [
				[
					{ id: 1, raw_row: { ring_no: 'AAA001' } },
					{ id: 2, raw_row: { ring_no: 'AAA002' } }
				]
			]
		});

		const rows = await fetchDemonRows(client as never, 7);

		expect(rows).toEqual([{ ring_no: 'AAA001' }, { ring_no: 'AAA002' }]);
		expect(client.limit).toHaveBeenCalledTimes(1);
	});

	it('keeps fetching while a page comes back full, and stops at the first short page', async () => {
		const { fetchDemonRows, DEMON_RECORDS_PAGE_SIZE } =
			await import('../reingest-group-encounters');
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
		const client = buildFakeSupabaseClient({
			pagesOfRows: [fullPage, shortPage]
		});

		const rows = await fetchDemonRows(client as never, 7);

		expect(rows).toHaveLength(DEMON_RECORDS_PAGE_SIZE + 1);
		expect(rows[rows.length - 1]).toEqual({ ring_no: 'LAST' });
		expect(client.limit).toHaveBeenCalledTimes(2);
	});

	it('keys each page off the previous page’s last id, not an offset', async () => {
		const { fetchDemonRows, DEMON_RECORDS_PAGE_SIZE } =
			await import('../reingest-group-encounters');
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
		const client = buildFakeSupabaseClient({ pagesOfRows: [fullPage, []] });

		await fetchDemonRows(client as never, 7);

		expect(client.gt).toHaveBeenNthCalledWith(1, 'id', 0);
		expect(client.gt).toHaveBeenNthCalledWith(2, 'id', lastIdOfFirstPage);
	});

	it('returns an empty array when the group has no staged rows', async () => {
		const { fetchDemonRows } = await import('../reingest-group-encounters');
		const client = buildFakeSupabaseClient({ pagesOfRows: [[]] });

		const rows = await fetchDemonRows(client as never, 7);

		expect(rows).toEqual([]);
	});

	it('scopes the query to the given ringing group id', async () => {
		const { fetchDemonRows } = await import('../reingest-group-encounters');
		const client = buildFakeSupabaseClient({ pagesOfRows: [[]] });

		await fetchDemonRows(client as never, 7);

		expect(client.eq).toHaveBeenCalledWith('ringing_group_id', 7);
	});
});

describe('reingestGroupEncounters group lookup', () => {
	it('rejects with an error naming the id, and never calls runDemonImport, when the ringing group id is not found', async () => {
		const { reingestGroupEncounters } =
			await import('../reingest-group-encounters');
		const client = buildFakeSupabaseClient({ groupName: null });

		await expect(
			collect(
				reingestGroupEncounters({
					supabaseClient: client as never,
					ringingGroupId: 999
				})
			)
		).rejects.toThrow('999');

		expect(mockRunDemonImport).not.toHaveBeenCalled();
	});
});

describe('reingestGroupEncounters fetched rows', () => {
	it('fetches the group’s staged rows and runs the shared orchestrator over them', async () => {
		const { reingestGroupEncounters } =
			await import('../reingest-group-encounters');
		mockRunDemonImport.mockReturnValue(
			canned([
				{ type: 'complete', processed: 1, successful: 1, failed: 0, skipped: 0 }
			])
		);
		const client = buildFakeSupabaseClient({
			groupName: 'Alpha',
			pagesOfRows: [[{ id: 1, raw_row: { ring_no: 'AAA001' } }]]
		});

		await collect(
			reingestGroupEncounters({
				supabaseClient: client as never,
				ringingGroupId: 7
			})
		);

		expect(mockRunDemonImport).toHaveBeenCalledWith({
			supabaseClient: client,
			ringingGroupId: 7,
			source: [{ ring_no: 'AAA001' }],
			concurrency: 30,
			logContext: { source: 'reingest', ringingGroupName: 'Alpha' }
		});
	});

	it('passes a given concurrency value straight through to the shared orchestrator', async () => {
		const { reingestGroupEncounters } =
			await import('../reingest-group-encounters');
		mockRunDemonImport.mockReturnValue(
			canned([
				{ type: 'complete', processed: 1, successful: 1, failed: 0, skipped: 0 }
			])
		);
		const client = buildFakeSupabaseClient({
			pagesOfRows: [[{ id: 1, raw_row: { ring_no: 'AAA001' } }]]
		});

		await collect(
			reingestGroupEncounters({
				supabaseClient: client as never,
				ringingGroupId: 7,
				concurrency: 1
			})
		);

		expect(mockRunDemonImport).toHaveBeenCalledWith(
			expect.objectContaining({ concurrency: 1 })
		);
	});

	it('yields one synthetic all-zero complete update, without calling the shared orchestrator, when the group has no staged rows', async () => {
		const { reingestGroupEncounters } =
			await import('../reingest-group-encounters');
		const client = buildFakeSupabaseClient({ pagesOfRows: [[]] });

		const updates = await collect(
			reingestGroupEncounters({
				supabaseClient: client as never,
				ringingGroupId: 7
			})
		);

		expect(updates).toEqual([
			{ type: 'complete', processed: 0, successful: 0, failed: 0, skipped: 0 }
		]);
		expect(mockRunDemonImport).not.toHaveBeenCalled();
	});
});

describe('reingestGroupEncounters update passthrough', () => {
	it('yields whatever the shared orchestrator yields, unmodified', async () => {
		const { reingestGroupEncounters } =
			await import('../reingest-group-encounters');
		mockRunDemonImport.mockReturnValue(
			canned([
				{ type: 'progress', processed: 10 },
				{ type: 'unrecognised_locations', locations: ['CES972'] }
			])
		);
		const client = buildFakeSupabaseClient({
			pagesOfRows: [[{ id: 1, raw_row: { ring_no: 'AAA001' } }]]
		});

		const updates = await collect(
			reingestGroupEncounters({
				supabaseClient: client as never,
				ringingGroupId: 7
			})
		);

		expect(updates).toEqual([
			{ type: 'progress', processed: 10 },
			{ type: 'unrecognised_locations', locations: ['CES972'] }
		]);
	});
});
