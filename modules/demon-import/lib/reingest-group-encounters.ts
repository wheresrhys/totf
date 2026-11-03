import type { SupabaseClient } from '@supabase/supabase-js';
import type { DemonRow, DemonImportUpdate } from '../types';
import { runDemonImport, DEFAULT_IMPORT_CONCURRENCY } from './run-demon-import';

/**
 * Rows fetched per `DemonRecords` page. Paginated rather than read in one
 * query, so a group with a large history doesn't require an unbounded single
 * response from PostgREST (which caps rows per request regardless).
 */
export const DEMON_RECORDS_PAGE_SIZE = 1000;

export interface ReingestGroupEncountersOptions {
	supabaseClient: SupabaseClient;
	ringingGroupId: number;
	/** Max rows processed concurrently once writing starts. Defaults to {@link DEFAULT_IMPORT_CONCURRENCY}. */
	concurrency?: number;
}

/**
 * Pages through every `DemonRecords` row for `ringingGroupId`, ordered by
 * `id` ascending (keyset pagination via `gt('id', lastId)`, not `.range()`
 * offsets, so a page boundary is stable even if rows are inserted
 * concurrently), and returns them as the `DemonRow`s the original CSV import
 * would have produced from `raw_row`.
 *
 * The whole group's history is still buffered into one in-memory array, same
 * as a CSV import buffers a whole file: `runDemonImport`'s location
 * pre-flight has to see every row's `loc_id` before the first write, so
 * there is no way to start writing from only a prefix of the pages.
 */
export async function fetchDemonRows(
	supabaseClient: SupabaseClient,
	ringingGroupId: number
): Promise<DemonRow[]> {
	const rows: DemonRow[] = [];
	let lastId = 0;

	for (;;) {
		const { data, error } = await supabaseClient
			.from('DemonRecords')
			.select('id, raw_row')
			.eq('ringing_group_id', ringingGroupId)
			.gt('id', lastId)
			.order('id', { ascending: true })
			.limit(DEMON_RECORDS_PAGE_SIZE);
		if (error) throw error;
		if (!data || data.length === 0) break;

		for (const record of data) rows.push(record.raw_row as DemonRow);
		lastId = data[data.length - 1].id as number;

		if (data.length < DEMON_RECORDS_PAGE_SIZE) break;
	}

	return rows;
}

/**
 * Re-runs the whole demon-import pipeline for an existing group from its
 * already-staged `DemonRecords` rows, rather than requiring the original
 * CSV. Useful once the write path has changed (a newly-modelled column, a
 * bug fix in this module) and a group's existing history needs
 * reinterpreting under the new logic without re-uploading anything.
 *
 * Always yields exactly one terminal `DemonImportUpdate` — the same contract
 * `runDemonImport` guarantees — including a synthetic all-zero `complete`
 * when the group has no staged rows at all, rather than ending with no
 * updates. A `ringingGroupId` that doesn't exist is a thrown `Error`, not a
 * yielded update: it's resolved before any run starts, not a pipeline
 * failure.
 */
export async function* reingestGroupEncounters(
	options: ReingestGroupEncountersOptions
): AsyncGenerator<DemonImportUpdate> {
	const {
		supabaseClient,
		ringingGroupId,
		concurrency = DEFAULT_IMPORT_CONCURRENCY
	} = options;

	const { data, error } = await supabaseClient
		.from('RingingGroups')
		.select('group_name')
		.eq('id', ringingGroupId)
		.maybeSingle();
	if (error) throw error;
	if (!data) {
		throw new Error(`Ringing group with id ${ringingGroupId} not found.`);
	}
	const ringingGroupName: string = data.group_name;

	const rows = await fetchDemonRows(supabaseClient, ringingGroupId);
	if (rows.length === 0) {
		yield {
			type: 'complete',
			processed: 0,
			successful: 0,
			failed: 0,
			skipped: 0
		};
		return;
	}

	yield* runDemonImport({
		supabaseClient,
		ringingGroupId,
		source: rows,
		concurrency,
		logContext: { source: 'reingest', ringingGroupName }
	});
}
