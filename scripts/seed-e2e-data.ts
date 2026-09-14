#!/usr/bin/env tsx
/**
 * Seed script for E2E / integration test data.
 *
 * Creates three groups (Alpha / Beta / Gamma) with canonical ringing data,
 * sets up cross-group sharing, and writes snapshot JSON fixtures used as
 * mock return values in unit tests.
 *
 * Run via: npm run db:seed:e2e
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../lib/supabase';
import { slugify } from '../lib/slugify';
import { generateSnapshots } from './generate-snapshots';
import { importCSV } from './import-csv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Local postgres connection – bypasses RLS (used only for GroupDataSharing INSERT)
const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function run(cmd: string) {
	console.log(`\n$ ${cmd}`);
	execSync(cmd, { stdio: 'inherit', cwd: ROOT });
}

/**
 * Import one seed CSV in-process at `concurrency: 1`.
 *
 * Deliberately not `npm run db:import:local` (a child process at the default
 * concurrency of 30): every table's `id` is `DEFAULT nextval(...)`, so under
 * concurrency the numeric id a given row ends up with depends on I/O timing,
 * and the fixtures under test-fixtures/snapshots/ embed literal ids. Serial
 * processing makes a reseed reproduce the same ids every time (#903).
 */
async function seedImport(relativeCsvPath: string, ringingGroupName: string) {
	console.log(`\nImporting ${relativeCsvPath} as "${ringingGroupName}"...`);
	await importCSV({
		csvFilePath: path.join(ROOT, relativeCsvPath),
		ringingGroupName,
		concurrency: 1
	});
}

async function getGroupId(name: string): Promise<number> {
	const { data, error } = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('group_name', name)
		.single();
	if (error || !data)
		throw new Error(`Group "${name}" not found: ${error?.message}`);
	return data.id;
}

async function main() {
	// Step 1: Pre-create all four groups with slugs, before any CSV import runs.
	// scripts/import-csv.ts no longer creates a RingingGroups row when the given name
	// isn't found (#473), so Alpha must exist here too, not just Beta/Gamma/Delta.
	// INSERT is allowed for all; UPDATE is restricted. Use ignoreDuplicates-via-23505 so
	// re-running doesn't fail when a group already exists.
	for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
		await supabase
			.from('RingingGroups')
			.insert({ group_name: name, slug: slugify(name) })
			.then(({ error }) => {
				// Ignore unique constraint violation (group already exists)
				if (error && error.code !== '23505')
					throw new Error(`Failed to create ${name}: ${error.message}`);
			});
	}
	const alphaId = await getGroupId('Alpha');
	const betaId = await getGroupId('Beta');
	const gammaId = await getGroupId('Gamma');
	const deltaId = await getGroupId('Delta');

	console.log(
		`Groups: Alpha(${alphaId}), Beta(${betaId}), Gamma(${gammaId}), Delta(${deltaId})`
	);

	// Step 2: Import Alpha CSV (Alpha group already exists from step 1)
	await seedImport('test-fixtures/csv/alpha.csv', 'Alpha');

	// Step 3: Insert GroupDataSharing via direct Postgres (bypasses RLS — no INSERT policy exists)
	// Alpha shares with Beta; Beta shares with Gamma. Not transitive.
	execSync(
		`psql "${LOCAL_DB_URL}" -c "INSERT INTO \\"GroupDataSharing\\" (granter_group_id, recipient_group_id) VALUES (${alphaId}, ${betaId}), (${betaId}, ${gammaId}) ON CONFLICT (granter_group_id, recipient_group_id) DO NOTHING;"`,
		{ stdio: 'inherit', cwd: ROOT }
	);
	console.log(`GroupDataSharing: Alpha→Beta, Beta→Gamma created`);

	// Step 4: Import Beta CSV (GroupDataSharing must exist first so SHARED01 is accessible to Beta)
	await seedImport('test-fixtures/csv/beta.csv', 'Beta');

	// Step 5: Set group passwords
	run(`npm run set-group-password:local -- "Alpha" "alphapassword"`);
	run(`npm run set-group-password:local -- "Beta" "betapassword"`);
	run(`npm run set-group-password:local -- "Gamma" "gammapassword"`);
	run(`npm run set-group-password:local -- "Delta" "deltapassword"`);

	// Step 6: Generate snapshot JSON fixtures
	await generateSnapshots(alphaId, betaId, gammaId);
}

main()
	.then(() => {
		console.log('\n✓ E2E seed complete');
		process.exit(0);
	})
	.catch((err) => {
		console.error('\nSeed failed:', err);
		process.exit(1);
	});
