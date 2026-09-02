/**
 * Shared low-level DB helpers for `supabase/__tests__/*.test.ts` integration tests:
 * a raw `psql` escape hatch for operations the Supabase client can't perform (RLS
 * bypass, foreign-key-violation assertions, cross-client teardown), plus
 * `createIsolatedGroup` for spinning up a throwaway `RingingGroups` row per
 * test/describe block. See CLAUDE.md's "DB integration tests" section for the
 * concurrency rationale behind isolated rows.
 *
 * Requires local Supabase running: npm run db:start:local
 */

import { execSync } from 'child_process';

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Runs a raw SQL statement against the local DB via psql, bypassing RLS/PostgREST. */
export function psql(sql: string): void {
	execSync(`psql "${LOCAL_DB_URL}" -c "${sql.replace(/"/g, '\\"')}"`);
}

/** Runs a raw SQL statement and returns its single scalar result as a string. */
export function psqlScalar(sql: string): string {
	return execSync(`psql "${LOCAL_DB_URL}" -t -A -c "${sql.replace(/"/g, '\\"')}"`)
		.toString()
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)[0];
}

/** Creates a throwaway `RingingGroups` row and returns its id. */
export function createIsolatedGroup(name: string): number {
	return Number(
		psqlScalar(
			`INSERT INTO "RingingGroups" (group_name, slug) VALUES ('${name}', '${name.toLowerCase().replace(/ /g, '-')}') RETURNING id;`
		)
	);
}
