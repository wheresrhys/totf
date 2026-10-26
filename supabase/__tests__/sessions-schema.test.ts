/**
 * Integration tests pinning what a `Sessions` row is NOT any more.
 *
 * This file used to be `session-type.test.ts` and covered the
 * `Sessions.session_type` identity column (#452) — the widened
 * `(visit_date, location_id, session_type)` unique constraint, the `CHECK` on the
 * allowed values, and `ringing_group_id` derivation on a hand-inserted PULLI row.
 * #1024 dropped `session_type` and `location_id` both, so a Session is now just
 * "a group's visit on a date" and every one of those behaviours is gone with the
 * columns. What survives from the original file is the shape of its
 * `is_resighting_only` block — a cheap schema assertion recording that a column
 * was deliberately removed, so a future migration can't quietly bring it back.
 *
 * The live uniqueness/derivation behaviour now lives in `db-constraints.test.ts`
 * (`Sessions uniqueness (visit_date, ringing_group_id)`) and `triggers.test.ts`.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect } from 'vitest';
import { psqlScalar } from './db-test-helpers';

function columnExists(table: string, column: string): boolean {
	return (
		Number(
			psqlScalar(
				`SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${column}';`
			)
		) > 0
	);
}

function functionExists(name: string): boolean {
	return (
		Number(
			psqlScalar(
				`SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = '${name}';`
			)
		) > 0
	);
}

describe('Sessions schema — columns deliberately removed', () => {
	// #456 — the boolean predecessor of session_type.
	it('has no is_resighting_only column', () => {
		expect(columnExists('Sessions', 'is_resighting_only')).toBe(false);
	});

	// #1024 — a Session covers a whole group-day, so it has no single location;
	// Encounters.location_id records where each encounter actually happened.
	it('has no location_id column', () => {
		expect(columnExists('Sessions', 'location_id')).toBe(false);
	});

	// #1024 — FULL_GROWN/PULLI/FIELD_OBSERVATION is re-derived per encounter from
	// record_type/age_code/is_juv wherever it's still needed.
	it('has no session_type column', () => {
		expect(columnExists('Sessions', 'session_type')).toBe(false);
	});

	it('still has the visit_date and ringing_group_id a Session is now keyed on', () => {
		expect(columnExists('Sessions', 'visit_date')).toBe(true);
		expect(columnExists('Sessions', 'ringing_group_id')).toBe(true);
	});
});

describe('Sessions schema — trigger function retired', () => {
	// trg_set_session_generated_fields derived Sessions.ringing_group_id by looking
	// the owning group up from Sessions.location_id. With that column gone it had
	// nothing to look up, so #1024 dropped it and lib/demon-import.ts writes
	// ringing_group_id directly instead.
	it('has no trg_set_session_generated_fields function', () => {
		expect(functionExists('trg_set_session_generated_fields')).toBe(false);
	});
});

// Pins a catalog object nothing else in the suite would notice regressing — same
// convention as supabase/__tests__/rpc-functions/stats-rpc-plan-cache-mode.test.ts's
// proconfig check, just against pg_statistic_ext instead of pg_proc. Without this
// object, Postgres assumes ringing_group_id and visit_date are independent, which
// flips Sessions' access path and collapses an accurate ~12-row estimate down to 1
// whenever a query combines an exact group filter with a visit_date range that
// happens to cover 100% of that group's rows — see
// supabase/schema/schemas/public/tables/"Sessions".sql's own comment on the
// CREATE STATISTICS declaration for the full mechanism.
function readSessionsExtendedStatsName(): string {
	return psqlScalar(
		`SELECT COALESCE(stxname, '(none)') FROM pg_statistic_ext WHERE stxname = 'sessions_ringing_group_id_visit_date_stats';`
	);
}

describe('Sessions extended statistics', () => {
	it('declares the ringing_group_id/visit_date correlation stats object', () => {
		expect(readSessionsExtendedStatsName()).toBe(
			'sessions_ringing_group_id_visit_date_stats'
		);
	});
});
