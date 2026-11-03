#!/usr/bin/env node

/**
 * CSV Import Script for Supabase
 *
 * Usage: npm run import -- <csv-file-path>
 * Example: npm run import -- data.csv
 *
 * Also importable as a library (`importCSV`) — the CLI block at the bottom only
 * runs when this file is the process entrypoint, so importing it is side-effect
 * free. `supabase/scripts/seed-e2e-data.ts` uses that to import at `concurrency: 1`,
 * which makes row processing (and therefore `nextval`-assigned row ids)
 * deterministic — see #903.
 */
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import { supabase } from '../../lib/supabase';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import csvParser from 'csv-parser';
import {
	runDemonImport,
	DEFAULT_IMPORT_CONCURRENCY,
	type DemonRow
} from '@/modules/demon-import';

export interface ImportOptions {
	csvFilePath: string;
	ringingGroupName: string;
	/**
	 * Max rows processed concurrently. Defaults to
	 * {@link DEFAULT_IMPORT_CONCURRENCY}. Pass `1` to serialize row processing,
	 * which is what deterministic seeding needs: every table's `id` is
	 * `DEFAULT nextval(...)`, so under concurrency the numeric id a given row
	 * gets depends on I/O timing.
	 */
	concurrency?: number;
}

export async function importCSV(options: ImportOptions): Promise<void> {
	const {
		csvFilePath,
		ringingGroupName,
		concurrency = DEFAULT_IMPORT_CONCURRENCY
	} = options;

	if (!fs.existsSync(csvFilePath)) {
		console.error(`Error: File not found: ${csvFilePath}`);
		process.exit(1);
	}

	console.log(`Starting import from ${csvFilePath}...`);

	// Look up the Ringing Group by name and get its ID. This script no longer
	// creates a missing group on the fly (#473) — groups are created via the seed
	// script or Supabase Studio, so an unrecognised name is almost always a typo.
	const { data: ringingGroupData, error: ringingGroupError } = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('group_name', ringingGroupName)
		.maybeSingle();
	if (ringingGroupError) {
		throw ringingGroupError;
	}
	if (!ringingGroupData) {
		console.error(
			`Error: Ringing group "${ringingGroupName}" not found. Create it first (e.g. via Supabase Studio) before importing — this script no longer creates groups automatically.`
		);
		process.exit(1);
	}
	const ringingGroupId: number = ringingGroupData.id;

	// The whole CSV is buffered rather than streamed straight into row
	// processing, because the location pre-flight has to see every row's
	// `loc_id` before the first row is written.
	const rowStream = fs.createReadStream(csvFilePath).pipe(csvParser());
	const rows: DemonRow[] = [];
	for await (const row of rowStream) {
		rows.push(row as DemonRow);
	}

	const groupSupabaseClient =
		await getAuthenticatedSupabaseClientForGroup(ringingGroupId);

	for await (const update of runDemonImport({
		supabaseClient: groupSupabaseClient,
		ringingGroupId,
		source: rows,
		concurrency,
		logContext: { csvFilePath, ringingGroupName }
	})) {
		switch (update.type) {
			case 'progress':
				break;
			case 'unrecognised_locations':
				console.error(
					`Error: these locations are not recognised for ringing group "${ringingGroupName}": ${update.locations.join(', ')}. No rows were imported. If a site was renamed, rename its existing Location to match before importing; if it is genuinely new, create it first.`
				);
				process.exit(1);
			case 'timeout':
				break;
			case 'error':
				throw new Error(update.message);
			case 'complete':
				console.log('\n✓ Import completed');
				console.log(`Total records: ${update.processed}`);
				console.log(`Successful: ${update.successful}`);
				console.log(`Failed: ${update.failed}`);
				console.log(`Skipped: ${update.skipped}`);
				break;
		}
	}
}

// Main execution — only when run directly (npm run db:import:{local|prod}),
// never when imported for `importCSV`.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const args = process.argv.slice(2);

	if (args.length < 2) {
		console.log(
			'Usage: npm run db:import:{local|prod} -- <csv-file-path> <ringing-group-name>'
		);
		console.log(
			'Example: npm run db:import:{local|prod} -- data/birds.csv "Walthamstow Wetlands"'
		);
		process.exit(1);
	}

	const csvFilePath = path.resolve(args[0]);
	const ringingGroupName =
		args[1] === 'w' || args[1] === 'W' ? 'Walthamstow Wetlands' : args[1];

	importCSV({ csvFilePath, ringingGroupName })
		.then(() => process.exit(0))
		.catch((error) => {
			console.error('Import failed:', error);
			process.exit(1);
		});
}
