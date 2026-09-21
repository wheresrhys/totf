/**
 * Regression guard for the `plan_cache_mode` declaration on the core_stats-family RPCs.
 *
 * All four are `LANGUAGE plpgsql`, so their single `RETURN QUERY` statement is plan-cached
 * per backend and switches to a GENERIC plan on the 6th execution in a session — and these
 * RPCs are parameterized by the SHAPE of their own query (`group_by_species` /
 * `group_by_time_period` decide which columns the spine join is keyed on), so no one generic
 * plan can serve them. Measured on a 160k-encounter synthetic fixture, the cliff ranged from
 * 6x (`arrivals_stats`) to 117x (`biometrics_stats` grouped by day), with `core_stats` going
 * 437ms -> 44,205ms once a pooled backend had served five cheap calls first. See CLAUDE.md's
 * "Companion stats RPCs and shared plumbing" section.
 *
 * `SET plan_cache_mode TO 'force_custom_plan'` in each function's header is what prevents
 * that. It lives in the declarative schema files, where nothing else would notice it being
 * dropped — hence this test. It is read-only (a `pg_proc` catalog read), so it is safe to run
 * alongside concurrent worktrees.
 *
 * Requires local Supabase running:
 *   npm run db:start:local
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect } from 'vitest';
import { psqlScalar } from '../db-test-helpers';

const PLAN_CACHE_MODE_RPCS = [
	'core_stats',
	'demographics_stats',
	'arrivals_stats',
	'biometrics_stats',
] as const;

function readProconfig(functionName: string): string {
	return psqlScalar(
		// '(none)' rather than '' so a function with no settings at all still yields a
		// readable value to assert against instead of an empty psqlScalar result.
		`SELECT COALESCE(array_to_string(p.proconfig, ','), '(none)') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = '${functionName}';`
	);
}

describe('stats RPC plan_cache_mode', () => {
	describe.each(PLAN_CACHE_MODE_RPCS)('%s', (functionName) => {
		it('declares force_custom_plan so the plan cache never goes generic', () => {
			expect(readProconfig(functionName)).toContain(
				'plan_cache_mode=force_custom_plan'
			);
		});
	});
});
