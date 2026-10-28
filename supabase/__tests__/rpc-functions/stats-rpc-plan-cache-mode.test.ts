/**
 * Regression guard for the `plan_cache_mode` declaration on the core_stats-family RPCs and
 * the four `stats_cache_*_metrics` RPCs.
 *
 * `PLAN_CACHE_MODE_RPCS` are all `LANGUAGE plpgsql`, so their single `RETURN QUERY` statement
 * is plan-cached per backend and switches to a GENERIC plan on the 6th execution in a session
 * — and these RPCs are parameterized by the SHAPE of their own query (`group_by_species` /
 * `group_by_time_period` decide which columns the spine join is keyed on), so no one generic
 * plan can serve them. Measured on a 160k-encounter synthetic fixture, the cliff ranged from
 * 6x (`arrivals_stats`) to 117x (the since-deleted `biometrics_stats` grouped by day), with
 * `core_stats` going 437ms -> 44,205ms once a pooled backend had served five cheap calls
 * first. See CLAUDE.md's "Companion stats RPCs and shared plumbing" section.
 *
 * `INLINING_GUARD_RPCS` are `LANGUAGE sql STABLE` instead, so they have no `RETURN QUERY` plan
 * cache of their own — but Postgres inlines a `SET`-config-free `LANGUAGE sql` function
 * straight into the caller's query, which exposes this same family's shape-parameterized
 * `CASE`/`OR`-guarded join to whichever CALLER's prepared statement gets reused on a pooled
 * PostgREST connection. Measured on a synthetic 180-Session/8650-Encounter/6164-Bird fixture
 * sized to the real failing prod group: `stats_cache_basic_session_metrics` ran 81-259ms on
 * executions 1-5 and 645ms-7.3s on executions 6-10 (~40x) — the now-removed
 * `stats_cache_new_adult_metrics` ran 51-76ms vs. 16.2s-23.1s (~400x), the worst measured case.
 * `SET plan_cache_mode TO 'force_custom_plan'` fixes this not
 * by giving a non-existent `RETURN QUERY` cache a custom-plan override, but by disqualifying
 * the function from inlining in the first place (any function carrying a `SET` clause is
 * ineligible for inlining). See supabase/CLAUDE.md's "plpgsql generic-plan-cliff audit"
 * section.
 *
 * Both groups need the identical declaration — `SET plan_cache_mode TO 'force_custom_plan'`
 * — just for two different reasons, so they share this one guard/helper.
 *
 * It lives in the declarative schema files, where nothing else would notice it being
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
] as const;

const INLINING_GUARD_RPCS = [
	'stats_cache_basic_session_metrics',
	'stats_cache_biometrics_metrics',
	'stats_cache_bird_age_metrics',
	'stats_cache_encounter_age_metrics',
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

	describe.each(INLINING_GUARD_RPCS)('%s', (functionName) => {
		it('declares force_custom_plan so it is ineligible for inlining into the caller', () => {
			expect(readProconfig(functionName)).toContain(
				'plan_cache_mode=force_custom_plan'
			);
		});
	});
});
