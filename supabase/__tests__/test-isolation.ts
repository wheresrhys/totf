/**
 * Isolation helpers for DB integration tests (`supabase/__tests__/*.test.ts`).
 *
 * Tests can run concurrently in separate git worktrees (see `swarm`) against the same
 * shared local Supabase instance. Any row a write test creates (ring numbers, group
 * names, session/location names, etc.) must use a random or ticket/branch-specific
 * identifier — never a fixed literal — so parallel runs never collide on the same row
 * or on the same aggregate query results. See CLAUDE.md's "DB integration tests"
 * section.
 *
 * Convention: extend a descriptive fixed prefix (e.g. `TRIG-TEST-`) with the suffix
 * from `randomTestSuffix()` rather than inventing a new isolation mechanism per file.
 */

/** A short random uppercase suffix to append to literal identifiers a test writes. */
export function randomTestSuffix(): string {
	return crypto.randomUUID().slice(0, 8).toUpperCase();
}

/**
 * A random date far enough in the future to never collide with e2e seed data (which
 * spans 2021–2024) or with the same date chosen by a concurrent test run. Use this
 * instead of a fixed literal date for any row that feeds a query aggregating across a
 * whole group (e.g. `stats_per_day_and_species`), where two concurrent runs picking the
 * same date would combine their rows into a single aggregate and break both runs'
 * expectations.
 */
export function randomFutureDate(): string {
	const year = 2080 + Math.floor(Math.random() * 20); // 2080–2099
	const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
	const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** Adds `days` (may be negative) to an ISO `YYYY-MM-DD` date string. */
export function addDays(isoDate: string, days: number): string {
	const date = new Date(`${isoDate}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}
