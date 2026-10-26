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

/** Every area tag `RingingGroups.public_areas` currently allows. */
export type PublicArea = 'summary';

/**
 * Creates a throwaway `RingingGroups` row and returns its id.
 *
 * `publicAreas` opts the group's named areas into anonymous public view, the
 * gate both `public_core_stats` and the stats-cache tables' SELECT RLS read
 * (#1202). It defaults to `[]` — a group that has published nothing — so every
 * existing single-argument call site is unaffected.
 */
export function createIsolatedGroup(
	name: string,
	publicAreas: readonly PublicArea[] = []
): number {
	const publicAreasLiteral =
		publicAreas.length === 0
			? `'{}'`
			: `ARRAY[${publicAreas.map((area) => `'${area}'`).join(', ')}]`;
	return Number(
		psqlScalar(
			`INSERT INTO "RingingGroups" (group_name, slug, public_areas) VALUES ('${name}', '${name.toLowerCase().replace(/ /g, '-')}', ${publicAreasLiteral}) RETURNING id;`
		)
	);
}

/**
 * Grants `recipientGroupId` read access to `granterGroupId`'s data, and returns
 * a function that revokes it again.
 *
 * Seeded by raw SQL rather than through an authenticated client on purpose:
 * `"GroupDataSharing"` has no INSERT policy at all, so a grantor can neither
 * create nor even see its own grants via PostgREST (see `rls.test.ts`'s header).
 */
export function grantGroupDataSharing(
	granterGroupId: number,
	recipientGroupId: number
): () => void {
	psql(
		`INSERT INTO "GroupDataSharing" (granter_group_id, recipient_group_id) VALUES (${granterGroupId}, ${recipientGroupId});`
	);
	return () =>
		psql(
			`DELETE FROM "GroupDataSharing" WHERE granter_group_id = ${granterGroupId} AND recipient_group_id = ${recipientGroupId};`
		);
}
