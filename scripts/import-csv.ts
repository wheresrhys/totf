#!/usr/bin/env node

/**
 * CSV Import Script for Supabase
 *
 * Usage: npm run import -- <csv-file-path>
 * Example: npm run import -- data.csv
 */
import { pRateLimit } from 'p-ratelimit';
import { getAuthenticatedSupabaseClientForGroup } from '../lib/group-auth';
import { supabase } from '../lib/supabase';
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { Database } from '../types/supabase.types';
import { createUpserter, processEncounterRow } from '../lib/demon-import';

type RingingGroupsInsert =
	Database['public']['Tables']['RingingGroups']['Insert'];

interface ImportOptions {
	csvFilePath: string;
	ringingGroupName: string;
}

// create a rate limiter that allows up to 30 API calls per second,
// with max concurrency of 10
const limit = pRateLimit({
	interval: 1000, // 1000 ms == 1 second
	rate: 30, // 30 API calls per interval
	concurrency: 30 // no more than 10 running at once
	// maxDelay: 2000              // an API call delayed > 2 sec is rejected
}) as <T>(fn: () => Promise<T>) => Promise<T>;

async function importCSV(options: ImportOptions): Promise<void> {
	const { csvFilePath, ringingGroupName } = options;

	if (!fs.existsSync(csvFilePath)) {
		console.error(`Error: File not found: ${csvFilePath}`);
		process.exit(1);
	}

	console.log(`Starting import from ${csvFilePath}...`);

	let totalRecords = 0;
	let successfulRecords = 0;
	let failedRecords = 0;
	const pendingRows: (Promise<void> | null)[] = [];

	// 0. Upsert Ringing Group (create if doesn't exist) and get ID
	// client just needs to have a group id - doenst need to be valid
	let ringingGroupId: number;
	const { data: ringingGroupData, error: ringingGroupError } = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('group_name', ringingGroupName)
		.maybeSingle();
	if (ringingGroupError) {
		throw ringingGroupError;
	}
	if (ringingGroupData) {
		ringingGroupId = ringingGroupData.id;
	} else {
		ringingGroupId = await createUpserter(supabase)<RingingGroupsInsert>(
			'RingingGroups',
			{
				group_name: ringingGroupName
			},
			'group_name'
		);
	}

	const groupSupabaseClient =
		await getAuthenticatedSupabaseClientForGroup(ringingGroupId);

	const upsert = createUpserter(groupSupabaseClient);
	return new Promise((resolve, reject) => {
		fs.createReadStream(csvFilePath)
			.pipe(csvParser())
			.on('data', (row) => {
				const rowIndex = totalRecords;
				totalRecords++;
				const promise = limit(() =>
					processEncounterRow(row, upsert, ringingGroupId)
						.then(
							() => successfulRecords++,
							(err) => {
								console.log(err);
								failedRecords++;
							}
						)
						.then(() => {
							pendingRows[rowIndex] = null;
						})
				);
				pendingRows[rowIndex] = promise;
			})
			.on('end', async () => {
				await Promise.all(pendingRows.filter((p) => Boolean(p)));
				console.log('\n✓ Import completed');
				console.log(`Total records: ${totalRecords}`);
				console.log(`Successful: ${successfulRecords}`);
				console.log(`Failed: ${failedRecords}`);
				resolve();
			})
			.on('error', (error) => {
				console.error('Error reading CSV file:', error);
				reject(error);
			});
	});
}

// Main execution
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
