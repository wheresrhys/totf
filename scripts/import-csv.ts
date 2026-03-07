#!/usr/bin/env node

/**
 * CSV Import Script for Supabase
 *
 * Usage: npm run import -- <csv-file-path>
 * Example: npm run import -- data.csv
 */
import { pRateLimit } from 'p-ratelimit';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { Database } from '../types/supabase.types';

type SpeciesInsert = Database['public']['Tables']['Species']['Insert'];
type BirdsInsert = Database['public']['Tables']['Birds']['Insert'];
type EncountersInsert = Database['public']['Tables']['Encounters']['Insert'];
type SessionsLegacyInsert =
	Database['public']['Tables']['SessionsLegacy']['Insert'];
type SessionsInsert = Database['public']['Tables']['Sessions']['Insert'];
type RingingGroupsInsert =
	Database['public']['Tables']['RingingGroups']['Insert'];
type LocationsInsert = Database['public']['Tables']['Locations']['Insert'];
type EncounterRow = Database['public']['Tables']['Encounters']['Row'];
type EncounterInsertWithTrigger = Omit<EncountersInsert, 'ringing_group_id'>;

interface ImportOptions {
	csvFilePath: string;
	ringingGroupName: string;
}
type DemonColumnNames =
	| 'entered_by'
	| 'nest_link_code'
	| 'validation_comments'
	| 'submission_status'
	| 'filename'
	| 'record_type'
	| 'new/subsequent'
	| 'ring_no'
	| 'scheme'
	| 'scheme2'
	| 'ring_no2'
	| 'species_name'
	| 'age'
	| 'pulli_ringed'
	| 'pulli_alive'
	| 'sex'
	| 'sexing_method'
	| 'provisional_sex'
	| 'breeding_condition'
	| 'visit_date'
	| 'capture_time'
	| 'loc_id'
	| 'gridref'
	| 'habitat_1'
	| 'habitat_2'
	| 'status_code_1'
	| 'status_code_2'
	| 'lure_code_1'
	| 'lure_code_2'
	| 'wing_length'
	| 'weight'
	| 'date_measured'
	| 'time_w'
	| 'condition'
	| 'moult_code'
	| 'alula'
	| 'old_greater_coverts'
	| 'primary_moult'
	| 'primary_covert_moult_scores'
	| 'secondary_moult_scores'
	| 'finding_condition'
	| 'finding_circumstances'
	| 'capture_method'
	| 'metal_mark_info'
	| 'ringer_initials'
	| 'ringer_check_initials'
	| 'processor_initials'
	| 'extractor_initials'
	| 'wing_initials'
	| 'colour_mark_info'
	| 'metal_mark_position'
	| 'fat'
	| 'pectoral_muscle'
	| 'body_moult'
	| 'greater_covert_moult_scores'
	| 'alula_moult_scores'
	| 'carpal_covert_moult'
	| 'wing_point'
	| 'primary_length'
	| 'bill_length_method'
	| 'bill_length'
	| 'head_bill_length'
	| 'bill_depth_method'
	| 'bill_depth'
	| 'tarsus_length_method'
	| 'tail_moult_scores'
	| 'tarsus_length'
	| 'tail_length'
	| 'claw_length'
	| 'plumage'
	| 'tail_diff'
	| 'lesser_median_covert_moult'
	| 'underwing_covert_moult'
	| 'head_moult'
	| 'upperparts_moult'
	| 'underparts_moult'
	| 'permit_no'
	| 'pullus_stage'
	| 'extra_text'
	| 'date_accuracy'
	| 'left_leg_below'
	| 'right_leg_below'
	| 'left_leg_above'
	| 'right_leg_above'
	| 'neck_collar'
	| 'left_wing_tag'
	| 'right_wing_tag'
	| 'nasal_saddle'
	| 'sample_processed'
	| 'high_tide_time'
	| 'finder_name'
	| 'own'
	| 'own2'
	| 'userc1'
	| 'userc2'
	| 'email'
	| 'userc3'
	| 'userc4'
	| 'userc5'
	| 'userv1'
	| 'userv2'
	| 'userv3'
	| 'userv4'
	| 'userv5'
	| 'l_primary_moult_scores'
	| 'l_secondary_moult_scores'
	| 'l_tail_moult_scores'
	| 'l_primary_covert_moult_scores'
	| 'l_greater_covert_moult_scores'
	| 'l_carpal_covert_moult'
	| 'l_alula_moult_scores'
	| 'toe_span';

type DemonRow = Record<DemonColumnNames, string>;

// Environment variables are loaded via 1Password CLI when running with npm run import
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('Error: Missing required environment variables');
	console.error(
		'Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
	);
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// create a rate limiter that allows up to 30 API calls per second,
// with max concurrency of 10
const limit = pRateLimit({
	interval: 1000, // 1000 ms == 1 second
	rate: 30, // 30 API calls per interval
	concurrency: 30 // no more than 10 running at once
	// maxDelay: 2000              // an API call delayed > 2 sec is rejected
}) as <T>(fn: () => Promise<T>) => Promise<T>;

// const limit = (fn => fn()) as <T>(fn: () => Promise<T>) => Promise<T>;

// Helper function to transform empty strings to null
function transformEmptyStringsToNull(
	obj: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(obj).map(([key, value]) => {
			// Handle string values
			if (typeof value === 'string') {
				const trimmed = value.trim();
				return [key, trimmed === '' ? null : trimmed];
			}
			// Return non-string values as-is
			return [key, value];
		})
	);
}

// Helper function to convert DD/MM/YYYY to YYYY-MM-DD
function convertDateFormat(dateString: string): string {
	return dateString.split('/').reverse().join('-');
}

async function upsert<DataInsertModel>(
	tableName: string,
	upsertData: DataInsertModel,
	uniqueColumn: keyof DataInsertModel,
	returnType: 'id' | 'row' = 'id'
): Promise<number> {
	const { data: upsertResult, error: upsertError } = await supabase
		.from(tableName)
		.upsert(upsertData, {
			onConflict: uniqueColumn as string,
			ignoreDuplicates: false
		})
		.select(returnType === 'id' ? 'id' : '*')
		.single();

	if (upsertError) throw upsertError;
	return upsertResult.id;
}

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
	const ringingGroupId = await upsert<RingingGroupsInsert>(
		'RingingGroups',
		{
			group_name: ringingGroupName
		},
		'group_name'
	);

	return new Promise((resolve, reject) => {
		fs.createReadStream(csvFilePath)
			.pipe(csvParser())
			.on('data', (row) => {
				const rowIndex = totalRecords;
				totalRecords++;
				const promise = limit(() =>
					createEncounterWithRelatedData(row)
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

		async function createEncounterWithRelatedData(row: DemonRow) {
			row = transformEmptyStringsToNull(row) as DemonRow;
			if (!row.ring_no) {
				throw new Error('Casualty encounters are not to be imported');
			}

			try {
				// 1. Upsert Species (create if doesn't exist) and get ID
				const speciesId = await upsert<SpeciesInsert>(
					'Species',
					{
						species_name: row.species_name as string
					},
					'species_name'
				);

				// 2. Upsert Bird (create if doesn't exist) and get ID
				const birdId = await upsert<BirdsInsert>(
					'Birds',
					{
						ring_no: row.ring_no as string,
						species_id: speciesId
					},
					'ring_no'
				);

				// 2.5 Upsert Location (create if doesn't exist) and get ID
				const locationId = await upsert<LocationsInsert>(
					'Locations',
					{
						location_name: row.loc_id as string,
						ringing_group_id: ringingGroupId as number
					},
					'location_name'
				);

				// 3. Upsert Session (create if doesn't exist) and get ID
				const visitDate = convertDateFormat(row.visit_date as string);
				const sessionLegacyId = await upsert<SessionsLegacyInsert>(
					'SessionsLegacy',
					{
						visit_date: visitDate
					},
					'visit_date'
				);

				const sessionId = await upsert<SessionsInsert>(
					'Sessions',
					{
						visit_date: visitDate,
						location_id: locationId
					},
					'visit_date,location_id'
				);

				// 4. Insert Encounter (always create new)
				const age_code: number = Number(String(row.age).replace('J', ''));

				const encounterResult = (await upsert<EncounterInsertWithTrigger>(
					'Encounters',
					{
						age_code,
						minimum_years: Math.max(0, Math.floor(age_code / 2 - 1)),
						breeding_condition: row.breeding_condition as string | null,
						capture_time: row.capture_time as string,
						extra_text: row.extra_text as string | null,
						is_juv: String(row.age).endsWith('J') as boolean,
						moult_code: row.moult_code as string | null,
						old_greater_coverts: row.old_greater_coverts
							? Number(row.old_greater_coverts)
							: null,
						record_type: row.record_type as string,
						bird_id: birdId,
						session_legacy_id: sessionLegacyId,
						session_id: sessionId,
						location_id: locationId,
						scheme: row.scheme as string,
						sex: row.sex as string,
						sexing_method: row.sexing_method as string | null,
						weight: row.weight ? Number(row.weight) : null,
						wing_length: row.wing_length ? Number(row.wing_length) : null
					},
					'bird_id,session_legacy_id' as keyof EncounterInsertWithTrigger,
					'row'
				)) as unknown as EncounterRow;

				return encounterResult;
			} catch (error) {
				console.error('Error creating encounter with related data:', error);
				throw error;
			}
		}
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
importCSV({ csvFilePath, ringingGroupName: args[1] })
	.then(() => process.exit(0))
	.catch((error) => {
		console.error('Import failed:', error);
		process.exit(1);
	});
