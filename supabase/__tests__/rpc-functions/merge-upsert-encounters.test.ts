/**
 * Integration tests for the `merge_upsert_encounters` Postgres RPC function
 * (#1219) — the atomic merge-upsert for duplicate Encounters within one import
 * run.
 *
 * Nothing calls this function yet (`lib/demon-import.ts` still uses the generic
 * multi-row `.upsert()`), so these tests call it directly over RPC and are the
 * only proof the merge rule is correct.
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClientForGroup } from '../../../app/lib/auth/group-auth';
import { supabase } from '../../../lib/supabase';
import { createIsolatedGroup, psql } from '../db-test-helpers';
import { randomFutureDate, randomTestSuffix } from '../test-isolation';

const testSuffix = randomTestSuffix();
const visitDate = randomFutureDate();

/** The columns the merge rule actually acts on, read back for every assertion. */
const MERGED_COLUMNS =
	'id, bird_id, location_id, visit_date, session_id, capture_time, record_type, age_code, sex, wing_length, weight, fat, extra_text';

type MergedEncounter = {
	id: number;
	bird_id: number;
	location_id: number;
	visit_date: string;
	session_id: number;
	capture_time: string;
	record_type: string;
	age_code: number;
	sex: string;
	wing_length: number | null;
	weight: number | null;
	fat: string | null;
	extra_text: string | null;
};

/**
 * What the function itself returns — `id` plus the natural-key columns, the
 * same shape `EncounterRowBatchWriter.bulkUpsert` selects today so the
 * follow-up ticket's id resolution needs no change.
 */
type ReturnedKey = {
	id: number;
	bird_id: number;
	location_id: number;
	visit_date: string;
};

describe('merge_upsert_encounters', () => {
	let groupId: number;
	let groupClient: SupabaseClient;
	let locationId: number;
	let sessionId: number;
	let speciesId: number;
	/** Every Birds row any test created, for teardown. */
	const createdBirdIds: number[] = [];

	beforeAll(async () => {
		// A throwaway group rather than a shared seed group: every test here
		// writes real Encounters rows, and an isolated group keeps them out of any
		// concurrent worktree's aggregate expectations.
		groupId = createIsolatedGroup(`Merge Upsert ${testSuffix}`);
		groupClient = await getAuthenticatedSupabaseClientForGroup(groupId);

		const { data: species, error: speciesError } = await supabase
			.from('Species')
			.select('id')
			.eq('species_name', 'Robin')
			.single();
		if (speciesError || !species)
			throw new Error('Robin species not found — run npm run db:seed:e2e first');
		speciesId = species.id;

		const { data: location, error: locationError } = await groupClient
			.from('Locations')
			.insert({
				location_name: `Merge Upsert Site ${testSuffix}`,
				ringing_group_id: groupId
			})
			.select('id')
			.single();
		if (locationError) throw locationError;
		locationId = location!.id;

		const { data: session, error: sessionError } = await groupClient
			.from('Sessions')
			.insert({ visit_date: visitDate, ringing_group_id: groupId })
			.select('id')
			.single();
		if (sessionError) throw sessionError;
		sessionId = session!.id;
	});

	afterAll(() => {
		psql(
			`DELETE FROM "Encounters" WHERE location_id = ${locationId};` +
				`DELETE FROM "Birds" WHERE id IN (${createdBirdIds.join(', ') || 'NULL'});` +
				`DELETE FROM "Sessions" WHERE id = ${sessionId};` +
				`DELETE FROM "Locations" WHERE id = ${locationId};` +
				`DELETE FROM "RingingGroups" WHERE id = ${groupId};`
		);
	});

	/** A bird nothing else in this file touches, so each test owns a natural key. */
	async function createBird(label: string): Promise<number> {
		const { data, error } = await groupClient
			.from('Birds')
			.insert({ ring_no: `MERGE-${testSuffix}-${label}`, species_id: speciesId })
			.select('id')
			.single();
		if (error) throw error;
		createdBirdIds.push(data!.id);
		return data!.id;
	}

	/**
	 * One row of the function's jsonb payload: the identity/FK columns plus the
	 * NOT NULL minimum, with every mergeable column a test varies defaulted to
	 * null so a call only has to name the fields it cares about.
	 */
	function encounterPayload(
		birdId: number,
		fields: {
			capture_time: string;
			record_type: string;
			age_code?: number;
			sex?: string;
			wing_length?: number | null;
			weight?: number | null;
			fat?: string | null;
			extra_text?: string | null;
		}
	) {
		return {
			bird_id: birdId,
			location_id: locationId,
			visit_date: visitDate,
			session_id: sessionId,
			scheme: 'BTO',
			age_code: 4,
			sex: 'M',
			wing_length: null,
			weight: null,
			fat: null,
			extra_text: null,
			...fields
		};
	}

	async function mergeUpsert(
		rows: ReturnType<typeof encounterPayload>[]
	): Promise<ReturnedKey[]> {
		const { data, error } = await groupClient.rpc('merge_upsert_encounters', {
			encounter_rows: rows
		});
		expect(error).toBeNull();
		return data as ReturnedKey[];
	}

	async function readEncounters(birdId: number): Promise<MergedEncounter[]> {
		const { data, error } = await groupClient
			.from('Encounters')
			// The column list is a runtime string, so PostgREST can't infer a row
			// shape from it — the second type argument says what it actually is,
			// the same escape hatch `EncounterRowBatchWriter.bulkUpsert` uses.
			.select<string, MergedEncounter>(MERGED_COLUMNS)
			.eq('bird_id', birdId);
		if (error) throw error;
		return data!;
	}

	/** The single row the merge is expected to have collapsed a key down to. */
	async function readMergedEncounter(birdId: number): Promise<MergedEncounter> {
		const rows = await readEncounters(birdId);
		expect(rows).toHaveLength(1);
		return rows[0];
	}

	describe('merging a duplicate pair', () => {
		it("keeps the earlier capture_time and its record_type when the second call's row is later", async () => {
			const birdId = await createBird('PAIR-LATER');

			await mergeUpsert([
				encounterPayload(birdId, { capture_time: '09:00:00', record_type: 'N' })
			]);
			await mergeUpsert([
				encounterPayload(birdId, { capture_time: '11:00:00', record_type: 'R' })
			]);

			const merged = await readMergedEncounter(birdId);
			expect(merged.capture_time).toBe('09:00:00');
			expect(merged.record_type).toBe('N');
		});

		it("keeps the earlier capture_time and its record_type when the second call's row is earlier", async () => {
			const birdId = await createBird('PAIR-EARLIER');

			await mergeUpsert([
				encounterPayload(birdId, { capture_time: '11:00:00', record_type: 'R' })
			]);
			await mergeUpsert([
				encounterPayload(birdId, { capture_time: '09:00:00', record_type: 'N' })
			]);

			const merged = await readMergedEncounter(birdId);
			expect(merged.capture_time).toBe('09:00:00');
			expect(merged.record_type).toBe('N');
		});

		it('fills a biometric field that was null on the first-seen row from the second row’s value', async () => {
			const birdId = await createBird('PAIR-FILL');

			await mergeUpsert([
				encounterPayload(birdId, {
					capture_time: '09:00:00',
					record_type: 'N',
					wing_length: 70
				})
			]);
			await mergeUpsert([
				encounterPayload(birdId, {
					capture_time: '11:00:00',
					record_type: 'R',
					weight: 18.5
				})
			]);

			const merged = await readMergedEncounter(birdId);
			expect(merged.wing_length).toBe(70);
			expect(merged.weight).toBe(18.5);
		});

		it('keeps the first-seen row’s biometric field unchanged when the second row also has a value', async () => {
			const birdId = await createBird('PAIR-KEEP');

			await mergeUpsert([
				encounterPayload(birdId, {
					capture_time: '09:00:00',
					record_type: 'N',
					wing_length: 70
				})
			]);
			await mergeUpsert([
				encounterPayload(birdId, {
					capture_time: '11:00:00',
					record_type: 'R',
					wing_length: 99
				})
			]);

			expect((await readMergedEncounter(birdId)).wing_length).toBe(70);
		});

		it('leaves identity columns (bird_id, location_id, visit_date) unchanged by the merge', async () => {
			const birdId = await createBird('PAIR-IDENTITY');

			await mergeUpsert([
				encounterPayload(birdId, { capture_time: '09:00:00', record_type: 'N' })
			]);
			await mergeUpsert([
				encounterPayload(birdId, { capture_time: '11:00:00', record_type: 'R' })
			]);

			const merged = await readMergedEncounter(birdId);
			expect(merged.bird_id).toBe(birdId);
			expect(merged.location_id).toBe(locationId);
			expect(merged.visit_date).toBe(visitDate);
		});
	});

	describe('merging more than two duplicates', () => {
		// Deliberately split 2 + 1 across two calls: the first call exercises the
		// in-batch fold and the second the ON CONFLICT clause, so the test fails if
		// the two implementations of the rule ever diverge.
		it('folds three rows sharing a key into one row using the same rule', async () => {
			const birdId = await createBird('TRIPLE');

			await mergeUpsert([
				encounterPayload(birdId, {
					capture_time: '09:00:00',
					record_type: 'N',
					wing_length: 70
				}),
				encounterPayload(birdId, {
					capture_time: '11:00:00',
					record_type: 'R',
					wing_length: 99,
					weight: 18.5
				})
			]);
			await mergeUpsert([
				encounterPayload(birdId, {
					capture_time: '13:00:00',
					record_type: 'R',
					weight: 21,
					fat: '3'
				})
			]);

			const merged = await readMergedEncounter(birdId);
			expect(merged).toMatchObject({
				capture_time: '09:00:00',
				record_type: 'N',
				wing_length: 70,
				weight: 18.5,
				fat: '3'
			});
		});
	});

	describe('order independence (concurrency safety)', () => {
		it('produces an identical final row whichever of two conflicting calls is applied first', async () => {
			const earlyThenLateBirdId = await createBird('ORDER-EARLY-FIRST');
			const lateThenEarlyBirdId = await createBird('ORDER-LATE-FIRST');

			const earlyRow = (birdId: number) =>
				encounterPayload(birdId, {
					capture_time: '09:00:00',
					record_type: 'N',
					wing_length: 70,
					extra_text: 'first of the round'
				});
			const lateRow = (birdId: number) =>
				encounterPayload(birdId, {
					capture_time: '11:00:00',
					record_type: 'R',
					wing_length: 99,
					weight: 18.5
				});

			await mergeUpsert([earlyRow(earlyThenLateBirdId)]);
			await mergeUpsert([lateRow(earlyThenLateBirdId)]);

			await mergeUpsert([lateRow(lateThenEarlyBirdId)]);
			await mergeUpsert([earlyRow(lateThenEarlyBirdId)]);

			const earlyFirst = await readMergedEncounter(earlyThenLateBirdId);
			const lateFirst = await readMergedEncounter(lateThenEarlyBirdId);
			// Everything but the two columns that identify which bird's row this
			// is — the whole point is that the merged payload is identical.
			expect({
				...lateFirst,
				id: earlyFirst.id,
				bird_id: earlyFirst.bird_id
			}).toEqual(earlyFirst);
		});
	});

	describe('rows with distinct natural keys', () => {
		it('inserts unrelated rows in the same call without interference', async () => {
			const firstBirdId = await createBird('DISTINCT-A');
			const secondBirdId = await createBird('DISTINCT-B');

			await mergeUpsert([
				encounterPayload(firstBirdId, {
					capture_time: '09:00:00',
					record_type: 'N',
					wing_length: 70
				}),
				encounterPayload(secondBirdId, {
					capture_time: '11:00:00',
					record_type: 'R',
					wing_length: 99
				})
			]);

			expect(await readMergedEncounter(firstBirdId)).toMatchObject({
				capture_time: '09:00:00',
				record_type: 'N',
				wing_length: 70
			});
			expect(await readMergedEncounter(secondBirdId)).toMatchObject({
				capture_time: '11:00:00',
				record_type: 'R',
				wing_length: 99
			});
		});
	});

	describe('batching', () => {
		it('returns one id per distinct natural key when the input batch contains duplicate keys', async () => {
			const duplicatedBirdId = await createBird('BATCH-DUPLICATED');
			const singleBirdId = await createBird('BATCH-SINGLE');

			const returnedRows = await mergeUpsert([
				encounterPayload(duplicatedBirdId, {
					capture_time: '09:00:00',
					record_type: 'N'
				}),
				encounterPayload(singleBirdId, {
					capture_time: '10:00:00',
					record_type: 'N'
				}),
				encounterPayload(duplicatedBirdId, {
					capture_time: '11:00:00',
					record_type: 'R'
				})
			]);

			expect(returnedRows).toHaveLength(2);
			const [duplicatedRow] = returnedRows.filter(
				(row) => row.bird_id === duplicatedBirdId
			);
			const [singleRow] = returnedRows.filter(
				(row) => row.bird_id === singleBirdId
			);
			expect(duplicatedRow).toMatchObject({
				bird_id: duplicatedBirdId,
				location_id: locationId,
				visit_date: visitDate
			});
			expect(singleRow.id).not.toBe(duplicatedRow.id);
			// The returned id is the id of the one row the duplicate pair collapsed
			// to, which is what the caller resolves chunk positions against.
			expect((await readMergedEncounter(duplicatedBirdId)).id).toBe(
				duplicatedRow.id
			);
		});
	});
});
