/**
 * DB integration tests for `upsert_simple_stats_cache_rows` — the sole write
 * path into "SimpleStatsCache". See
 * supabase/schema/schemas/public/functions/upsert_simple_stats_cache_rows.sql
 * for why the write goes through an RPC rather than a native supabase-js
 * .upsert(), and simple-stats-cache-table.test.ts for the four unique indexes
 * this function's four branches each target.
 *
 * Requires local Supabase running:
 *   npm run db:start:local
 *
 * Run with: npm run test:integration
 *
 * All rows created here use a run-unique suffix and/or a random future date so
 * concurrent worktree runs against the shared local Supabase instance never
 * collide (see CLAUDE.md's "DB integration tests" section and
 * supabase/__tests__/test-isolation.ts).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import { createIsolatedGroup, psql } from './db-test-helpers';
import { randomTestSuffix, randomFutureDate } from './test-isolation';
import { buildSimpleStatsCacheCell, createIsolatedSpecies, type TemporalUnit } from './stats-cache-fixtures';

describe('upsert_simple_stats_cache_rows', () => {
	const suffix = randomTestSuffix();
	let ownerGroupId: number;
	let otherGroupId: number;
	let speciesId: number;
	let ownerClient: SupabaseClient;
	let otherClient: SupabaseClient;

	beforeAll(async () => {
		ownerGroupId = createIsolatedGroup(`ussc-owner-${suffix}`);
		otherGroupId = createIsolatedGroup(`ussc-other-${suffix}`);
		speciesId = createIsolatedSpecies(`UpsertSimpleStatsCacheSpecies-${suffix}`);
		[ownerClient, otherClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(ownerGroupId),
			getAuthenticatedSupabaseClientForGroup(otherGroupId),
		]);
	});

	// Per-test cleanup: the all-time patterns key on (group_id, temporal_unit
	// [, species_id]) with no time_period to vary, so rows left behind by one
	// test would be picked up as pre-existing by the next one's upsert.
	afterEach(() => {
		psql(`DELETE FROM "SimpleStatsCache" WHERE group_id IN (${ownerGroupId}, ${otherGroupId});`);
	});

	afterAll(() => {
		psql(
			`DELETE FROM "SimpleStatsCache" WHERE group_id IN (${ownerGroupId}, ${otherGroupId});` +
				`DELETE FROM "Species" WHERE id = ${speciesId};` +
				`DELETE FROM "RingingGroups" WHERE id IN (${ownerGroupId}, ${otherGroupId});`
		);
	});

	function upsert(
		client: SupabaseClient,
		{
			groupId,
			temporalUnit,
			groupBySpecies,
			rows,
		}: {
			groupId: number;
			temporalUnit: TemporalUnit;
			groupBySpecies: boolean;
			rows: ReturnType<typeof buildSimpleStatsCacheCell>[];
		}
	) {
		return client.rpc('upsert_simple_stats_cache_rows', {
			p_group_id: groupId,
			p_temporal_unit: temporalUnit,
			p_group_by_species: groupBySpecies,
			p_rows: rows,
		});
	}

	function readOwnerRows() {
		return ownerClient
			.from('SimpleStatsCache')
			.select('species_id, time_period, temporal_unit, bird_count')
			.eq('group_id', ownerGroupId);
	}

	describe('skipping an empty batch', () => {
		it('writes nothing and raises nothing for an empty row array', async () => {
			const { error } = await upsert(ownerClient, {
				groupId: ownerGroupId,
				temporalUnit: 'month',
				groupBySpecies: true,
				rows: [],
			});
			expect(error).toBeNull();

			const { data } = await readOwnerRows();
			expect(data).toEqual([]);
		});
	});

	describe("guarding that every row matches the batch's declared null-pattern", () => {
		it("raises rather than writing when a row's species_id disagrees with p_group_by_species", async () => {
			const { error } = await upsert(ownerClient, {
				groupId: ownerGroupId,
				temporalUnit: 'month',
				groupBySpecies: true,
				rows: [buildSimpleStatsCacheCell({ speciesId: null })],
			});
			expect(error?.message).toMatch(/null-pattern does not match/);

			const { data } = await readOwnerRows();
			expect(data).toEqual([]);
		});

		it("raises rather than writing when a row's time_period disagrees with p_temporal_unit", async () => {
			const { error } = await upsert(ownerClient, {
				groupId: ownerGroupId,
				temporalUnit: 'all-time',
				groupBySpecies: true,
				rows: [buildSimpleStatsCacheCell({ speciesId })],
			});
			expect(error?.message).toMatch(/null-pattern does not match/);

			const { data } = await readOwnerRows();
			expect(data).toEqual([]);
		});
	});

	describe("upserting through the declared pattern's own unique index", () => {
		/** Upserts one cell, then re-upserts it with a different bird_count, and
		 * returns every row the group now has — so each branch's test asserts both
		 * that the insert landed and that the second call updated in place rather
		 * than inserting a duplicate or erroring on the wrong arbiter index. */
		async function upsertTwice({
			temporalUnit,
			groupBySpecies,
			cellSpeciesId,
			cellTimePeriod,
		}: {
			temporalUnit: TemporalUnit;
			groupBySpecies: boolean;
			cellSpeciesId: number | null;
			cellTimePeriod: string | null;
		}) {
			const cell = (bird_count: number) =>
				buildSimpleStatsCacheCell({ speciesId: cellSpeciesId, timePeriod: cellTimePeriod, bird_count });

			const insert = await upsert(ownerClient, {
				groupId: ownerGroupId,
				temporalUnit,
				groupBySpecies,
				rows: [cell(1)],
			});
			const update = await upsert(ownerClient, {
				groupId: ownerGroupId,
				temporalUnit,
				groupBySpecies,
				rows: [cell(2)],
			});
			const { data } = await readOwnerRows();
			return { insert, update, rows: data };
		}

		it('inserts then updates a per-species, dated cell in place', async () => {
			const timePeriod = randomFutureDate();
			const { insert, update, rows } = await upsertTwice({
				temporalUnit: 'month',
				groupBySpecies: true,
				cellSpeciesId: speciesId,
				cellTimePeriod: timePeriod,
			});
			expect(insert.error).toBeNull();
			expect(update.error).toBeNull();
			expect(rows).toEqual([
				{ species_id: speciesId, time_period: timePeriod, temporal_unit: 'month', bird_count: 2 },
			]);
		});

		it('inserts then updates an all-species, dated cell in place', async () => {
			const timePeriod = randomFutureDate();
			const { insert, update, rows } = await upsertTwice({
				temporalUnit: 'month',
				groupBySpecies: false,
				cellSpeciesId: null,
				cellTimePeriod: timePeriod,
			});
			expect(insert.error).toBeNull();
			expect(update.error).toBeNull();
			expect(rows).toEqual([{ species_id: null, time_period: timePeriod, temporal_unit: 'month', bird_count: 2 }]);
		});

		it('inserts then updates a per-species, all-time cell in place', async () => {
			const { insert, update, rows } = await upsertTwice({
				temporalUnit: 'all-time',
				groupBySpecies: true,
				cellSpeciesId: speciesId,
				cellTimePeriod: null,
			});
			expect(insert.error).toBeNull();
			expect(update.error).toBeNull();
			expect(rows).toEqual([{ species_id: speciesId, time_period: null, temporal_unit: 'all-time', bird_count: 2 }]);
		});

		it('inserts then updates an all-species, all-time cell in place', async () => {
			const { insert, update, rows } = await upsertTwice({
				temporalUnit: 'all-time',
				groupBySpecies: false,
				cellSpeciesId: null,
				cellTimePeriod: null,
			});
			expect(insert.error).toBeNull();
			expect(update.error).toBeNull();
			expect(rows).toEqual([{ species_id: null, time_period: null, temporal_unit: 'all-time', bird_count: 2 }]);
		});
	});

	describe("staying inside the caller's own group", () => {
		it("rejects a batch addressed at another group's rows — the function is SECURITY INVOKER, so the table's own RLS policy applies", async () => {
			const { error } = await upsert(otherClient, {
				groupId: ownerGroupId,
				temporalUnit: 'month',
				groupBySpecies: true,
				rows: [buildSimpleStatsCacheCell({ speciesId })],
			});
			expect(error?.code).toBe('42501'); // insufficient_privilege (RLS WITH CHECK)

			const { data } = await readOwnerRows();
			expect(data).toEqual([]);
		});
	});
});
