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
import { generateSnapshots } from './generate-snapshots';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Local postgres connection – bypasses RLS (used only for GroupDataSharing INSERT)
const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function run(cmd: string) {
	console.log(`\n$ ${cmd}`);
	execSync(cmd, { stdio: 'inherit', cwd: ROOT });
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
	// Step 1: Import Alpha CSV (creates Alpha group + all data)
	run(`npm run db:import:local -- test-fixtures/csv/alpha.csv "Alpha"`);

	// Step 2: Get Alpha ID
	const alphaId = await getGroupId('Alpha');

	// Step 3: Pre-create Beta + Gamma groups (INSERT is allowed for all; UPDATE is restricted)
	// Use ignoreDuplicates so re-running doesn't fail when group already exists.
	for (const name of ['Beta', 'Gamma']) {
		await supabase
			.from('RingingGroups')
			.insert({ group_name: name })
			.then(({ error }) => {
				// Ignore unique constraint violation (group already exists)
				if (error && error.code !== '23505')
					throw new Error(`Failed to create ${name}: ${error.message}`);
			});
	}
	const betaId = await getGroupId('Beta');
	const gammaId = await getGroupId('Gamma');

	console.log(`Groups: Alpha(${alphaId}), Beta(${betaId}), Gamma(${gammaId})`);

	// Step 4: Insert GroupDataSharing via direct Postgres (bypasses RLS — no INSERT policy exists)
	// Alpha shares with Beta; Beta shares with Gamma. Not transitive.
	execSync(
		`psql "${LOCAL_DB_URL}" -c "INSERT INTO \\"GroupDataSharing\\" (granter_group_id, recipient_group_id) VALUES (${alphaId}, ${betaId}), (${betaId}, ${gammaId}) ON CONFLICT (granter_group_id, recipient_group_id) DO NOTHING;"`,
		{ stdio: 'inherit', cwd: ROOT }
	);
	console.log(`GroupDataSharing: Alpha→Beta, Beta→Gamma created`);

	// Step 5: Import Beta CSV (GroupDataSharing must exist first so SHARED01 is accessible to Beta)
	run(`npm run db:import:local -- test-fixtures/csv/beta.csv "Beta"`);

	// Step 6: Set group passwords
	run(`npm run set-group-password:local -- "Alpha" "alphapassword"`);
	run(`npm run set-group-password:local -- "Beta" "betapassword"`);
	run(`npm run set-group-password:local -- "Gamma" "gammapassword"`);

	// Step 7: Generate snapshot JSON fixtures
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
