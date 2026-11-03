import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EncounterRowBatchWriter } from '../../encounter-batch-writer';

export const DOMAIN_RINGING_GROUP_ID = 7;
export const DOMAIN_IMPORT_JOB_ID = 42;

/**
 * Distinct id ranges per table, so an id that has been routed onto the wrong
 * column is obvious from a failure message rather than a plausible-looking `1`.
 */
const MOCK_ID_BASE: Record<string, number> = {
	Species: 100,
	Birds: 200,
	Locations: 300,
	Sessions: 400,
	Encounters: 500
};

/**
 * Mock Supabase client for the domain-table writer: records every bulk upsert and
 * answers it with the natural-key columns it was asked to select plus a
 * table-scoped id, exactly as PostgREST would — which is what lets a test assert
 * that a later entity's payload carries the id an earlier one actually resolved.
 */
export function makeDomainTablesClient({
	/**
	 * Rows a previous import left in Encounters, answered to the chunk's
	 * stored-row read (#1219). Filtered by the read's own `eq`/`in` filters, so
	 * seeding a row on an unrelated key proves the read's superset filter is
	 * narrowed back down client-side.
	 */
	storedEncounters = [] as Record<string, unknown>[]
} = {}) {
	const upsertCalls: {
		table: string;
		rows: Record<string, unknown>[];
		options: Record<string, unknown>;
		selectedColumns: string[];
	}[] = [];
	const selectCalls: {
		table: string;
		selectedColumns: string[];
		filters: { operator: string; column: string; value: unknown }[];
	}[] = [];
	const idsByTableAndKey = new Map<string, number>();
	const nextIdByTable: Record<string, number> = {};
	let failingTable: string | null = null;
	let failure: unknown = null;
	let failingSelectTable: string | null = null;
	let selectFailure: unknown = null;
	let reverseResponseRows = false;

	/** A stable id per (table, natural key), minted in the order rows are seen. */
	function idFor(table: string, naturalKey: string): number {
		const mapKey = `${table}|${naturalKey}`;
		const existingId = idsByTableAndKey.get(mapKey);
		if (existingId !== undefined) return existingId;
		const mintedId = (nextIdByTable[table] ?? MOCK_ID_BASE[table]) + 1;
		nextIdByTable[table] = mintedId;
		idsByTableAndKey.set(mapKey, mintedId);
		return mintedId;
	}

	function respondTo(
		table: string,
		rows: Record<string, unknown>[],
		selectedColumns: string[]
	) {
		const keyColumns = selectedColumns.filter((column) => column !== 'id');
		const data = rows.map((row) => {
			const echoedRow: Record<string, unknown> = {
				id: idFor(
					table,
					JSON.stringify(keyColumns.map((column) => row[column]))
				)
			};
			for (const column of keyColumns) echoedRow[column] = row[column];
			return echoedRow;
		});
		return reverseResponseRows ? data.reverse() : data;
	}

	/**
	 * The read half of the client: a thenable that collects `eq`/`in` filters
	 * and, when awaited, answers with the seeded rows every filter accepts.
	 */
	function makeSelectQuery(table: string, selectedColumnList: string) {
		const filters: { operator: string; column: string; value: unknown }[] = [];
		selectCalls.push({
			table,
			selectedColumns: selectedColumnList.split(','),
			filters
		});
		const matchesFilters = (row: Record<string, unknown>) =>
			filters.every(({ operator, column, value }) => {
				if (!(column in row)) return true;
				return operator === 'in'
					? (value as unknown[]).includes(row[column])
					: row[column] === value;
			});
		const query = {
			eq: (column: string, value: unknown) => {
				filters.push({ operator: 'eq', column, value });
				return query;
			},
			in: (column: string, value: unknown[]) => {
				filters.push({ operator: 'in', column, value });
				return query;
			},
			then: (
				onFulfilled: (result: {
					data: Record<string, unknown>[] | null;
					error: unknown;
				}) => unknown
			) =>
				Promise.resolve(
					failingSelectTable === table
						? { data: null, error: selectFailure }
						: {
								data:
									table === 'Encounters'
										? storedEncounters.filter(matchesFilters)
										: [],
								error: null
							}
				).then(onFulfilled)
		};
		return query;
	}

	const from = vi.fn((table: string) => ({
		select: (selectedColumnList: string) =>
			makeSelectQuery(table, selectedColumnList),
		upsert: (
			rows: Record<string, unknown>[],
			options: Record<string, unknown>
		) => ({
			select: (selectedColumnList: string) => {
				const selectedColumns = selectedColumnList.split(',');
				upsertCalls.push({ table, rows, options, selectedColumns });
				if (failingTable === table)
					return Promise.resolve({ data: null, error: failure });
				return Promise.resolve({
					data: respondTo(table, rows, selectedColumns),
					error: null
				});
			}
		})
	}));

	return {
		// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain the batch writer uses, not the full SupabaseClient interface
		client: { from } as unknown as SupabaseClient,
		upsertCalls,
		selectCalls,
		/** Which tables were upserted into, in the order the calls were made. */
		tablesInCallOrder: () => upsertCalls.map(({ table }) => table),
		/** The rows of the first (usually only) bulk upsert into `table`. */
		rowsUpsertedInto: (table: string) =>
			upsertCalls.find((call) => call.table === table)?.rows ?? [],
		/** The id this client answered with for one natural key — assert against it. */
		idFor: (table: string, ...keyValues: unknown[]) =>
			idFor(table, JSON.stringify(keyValues)),
		failOn: (table: string, error: unknown) => {
			failingTable = table;
			failure = error;
		},
		/** Fail the read half only, leaving every upsert working. */
		failSelectOn: (table: string, error: unknown) => {
			failingSelectTable = table;
			selectFailure = error;
		},
		/** Answer every upsert with its rows in reverse request order. */
		reverseResponses: () => {
			reverseResponseRows = true;
		}
	};
}

export function makeEncounterRowWriter({
	chunkSize = 2,
	ringSequenceId = null,
	limitChunkFlush,
	storedEncounters
}: {
	chunkSize?: number;
	ringSequenceId?: number | null;
	limitChunkFlush?: (flushChunk: () => Promise<void>) => Promise<void>;
	storedEncounters?: Record<string, unknown>[];
} = {}) {
	const domainTablesClient = makeDomainTablesClient({ storedEncounters });
	const lookupRingSequence = vi.fn().mockResolvedValue(ringSequenceId);
	const linkRingSequence = vi.fn().mockResolvedValue(undefined);
	const writer = new EncounterRowBatchWriter(domainTablesClient.client, {
		ringingGroupId: DOMAIN_RINGING_GROUP_ID,
		importJobId: DOMAIN_IMPORT_JOB_ID,
		lookupRingSequence,
		linkRingSequence,
		chunkSize,
		limitChunkFlush
	});
	return { domainTablesClient, writer, lookupRingSequence, linkRingSequence };
}

/** A limiter that admits every chunk flush but never lets one run. */
export function neverRunningChunkLimiter() {
	const flushesAdmitted: (() => Promise<void>)[] = [];
	return {
		flushesAdmitted,
		limitChunkFlush: (flushChunk: () => Promise<void>) => {
			flushesAdmitted.push(flushChunk);
			return new Promise<void>(() => {});
		}
	};
}
