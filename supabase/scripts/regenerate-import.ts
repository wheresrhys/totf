#!/usr/bin/env node

/**
 * Regenerate script (#1185) — re-runs a Ringing Group's whole demon-import
 * pipeline (Species/Birds/Locations/Sessions/Encounters) from the rows
 * already staged in `DemonRecords`, rather than requiring the original CSV
 * file. Useful once the write path has changed (a new column modelled, a bug
 * fix in `lib/demon-import.ts`) and a group's existing history needs
 * reinterpreting under the new logic without re-uploading anything.
 *
 * Usage: npm run prod:run:write -- tsx supabase/scripts/regenerate-import.ts <ringing-group-id>
 * Also importable as a library (`regenerateImport`) — same side-effect-free-on-import
 * shape as `importCSV` in `./import-csv.ts`.
 */
import { pathToFileURL } from 'url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import { supabase } from '../../lib/supabase';
import type { DemonRow } from '../../lib/demon-import';
import { DEFAULT_IMPORT_CONCURRENCY, runImport } from './import-csv';

/**
 * Rows fetched per page. `DemonRecords` rows are keyset-paginated on `id`
 * rather than read in one query, so a group with a large history doesn't
 * require an unbounded single response from PostgREST (which caps rows per
 * request regardless).
 */
export const DEMON_RECORDS_PAGE_SIZE = 1000;

export interface RegenerateOptions {
	ringingGroupId: number;
	/**
	 * Max rows processed concurrently once writing starts. See
	 * `ImportOptions.concurrency` in `./import-csv.ts` — same meaning, same
	 * default, passed straight through to `runImport`.
	 */
	concurrency?: number;
}

/**
 * Pages through every `DemonRecords` row for `ringingGroupId`, ordered by
 * `id` ascending (keyset pagination via `gt('id', lastId)`, not `.range()`
 * offsets, so a page boundary is stable even if rows are inserted
 * concurrently), and returns them as the `DemonRow`s the original CSV import
 * would have produced from `raw_row`.
 *
 * The whole group's history is still buffered into one in-memory array,
 * same as `importCSV` buffers a whole CSV file: `runImport`'s location
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

export async function regenerateImport(
	options: RegenerateOptions
): Promise<void> {
	const { ringingGroupId, concurrency = DEFAULT_IMPORT_CONCURRENCY } = options;

	// This script takes a group id directly rather than a name — it is never
	// called interactively with a typo-prone name the way `importCSV` is — but
	// the pipeline's error/log messages (and `dispatchStatsCacheRefreshEvents`'
	// own logging) still want a human-readable name, so it's resolved here
	// purely for display.
	const { data: ringingGroupData, error: ringingGroupError } = await supabase
		.from('RingingGroups')
		.select('group_name')
		.eq('id', ringingGroupId)
		.maybeSingle();
	if (ringingGroupError) {
		throw ringingGroupError;
	}
	if (!ringingGroupData) {
		console.error(`Error: Ringing group with id ${ringingGroupId} not found.`);
		process.exit(1);
	}
	const ringingGroupName: string = ringingGroupData.group_name;

	const groupSupabaseClient =
		await getAuthenticatedSupabaseClientForGroup(ringingGroupId);

	console.log(
		`Fetching staged DemonRecords rows for "${ringingGroupName}" (id ${ringingGroupId})...`
	);
	const rows = await fetchDemonRows(groupSupabaseClient, ringingGroupId);
	if (rows.length === 0) {
		console.log(
			`No DemonRecords rows found for "${ringingGroupName}" (id ${ringingGroupId}) — nothing to regenerate.`
		);
		return;
	}
	console.log(`Fetched ${rows.length} staged row(s). Regenerating...`);

	await runImport({
		rows,
		ringingGroupId,
		ringingGroupName,
		concurrency,
		logContext: { source: 'regenerate' }
	});
}

// Main execution — only when run directly, never when imported for
// `regenerateImport`.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const args = process.argv.slice(2);

	if (args.length < 1) {
		console.log(
			'Usage: npm run prod:run:write -- tsx supabase/scripts/regenerate-import.ts <ringing-group-id>'
		);
		process.exit(1);
	}

	const ringingGroupId = Number(args[0]);
	if (!Number.isInteger(ringingGroupId)) {
		console.error(
			`Error: <ringing-group-id> must be an integer, got "${args[0]}"`
		);
		process.exit(1);
	}

	regenerateImport({ ringingGroupId })
		.then(() => process.exit(0))
		.catch((error) => {
			console.error('Regenerate failed:', error);
			process.exit(1);
		});
}
