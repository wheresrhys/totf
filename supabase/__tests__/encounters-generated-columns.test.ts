/**
 * Integration tests for `Encounters.is_resighting`, a stored GENERATED column
 * (data-layer PR adding it) computing `record_type = ANY (ARRAY['U','F','D'])` —
 * the same U/F/D resighting/recovery record_type set `public.resighting_record_type`
 * names and (until removed) `modules/demon-import`'s `RESIGHTING_RECORD_TYPES`
 * constant mirrors. Kept as a hardcoded literal rather than reading the enum:
 * GENERATED columns require an IMMUTABLE expression and `enum_range()` is only
 * STABLE (see Encounters.sql's comment on the column).
 *
 * Requires local Supabase running and e2e seed data loaded:
 *   npm run db:start:local
 *   npm run db:seed:e2e
 *
 * Run with: npm run test:integration
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import { randomTestSuffix, randomFutureDate, addDays } from './test-isolation';
import { psql } from './db-test-helpers';
import { getGroupIdByName } from './rpc-functions/helpers/seed-lookups';
import {
	insertTestLocation,
	insertTestSession,
	insertTestBird,
	insertTestEncounter
} from './rpc-functions/helpers/encounter-fixtures';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('Encounters.is_resighting generated column', () => {
	let groupClient: SupabaseClient;
	let locationId: number;
	const birdIds: number[] = [];
	const baseDate = randomFutureDate();

	async function insertAndReadIsResighting(
		recordType: string,
		dayOffset: number
	): Promise<boolean | null> {
		const testSuffix = randomTestSuffix();
		const visitDate = addDays(baseDate, dayOffset);
		const sessionId = await insertTestSession(groupClient, locationId, visitDate);
		const birdId = await insertTestBird(
			groupClient,
			`ENC-GEN-COL-TEST-${recordType}-${testSuffix}`,
			robinSpeciesId
		);
		birdIds.push(birdId);
		await insertTestEncounter(groupClient, birdId, sessionId, {
			record_type: recordType,
			age_code: 1
		});
		const { data, error } = await groupClient
			.from('Encounters')
			.select('is_resighting')
			.eq('bird_id', birdId)
			.single();
		if (error) throw error;
		return data!.is_resighting;
	}

	let robinSpeciesId: number;

	beforeAll(async () => {
		const deltaId = await getGroupIdByName('Delta');
		groupClient = await getAuthenticatedSupabaseClientForGroup(deltaId);

		const { data: species, error: speciesError } = await groupClient
			.from('Species')
			.select('id')
			.eq('species_name', 'Robin')
			.single();
		if (speciesError || !species)
			throw new Error('Robin species not found — run npm run db:seed:e2e first');
		robinSpeciesId = species.id;

		locationId = await insertTestLocation(
			groupClient,
			deltaId,
			`Enc Gen Col Test Location ${randomTestSuffix()}`
		);
	});

	afterAll(() => {
		if (birdIds.length === 0) return;
		psql(
			`DELETE FROM "Encounters" WHERE bird_id IN (${birdIds.join(', ')});` +
				`DELETE FROM "Birds" WHERE id IN (${birdIds.join(', ')});` +
				`DELETE FROM "Locations" WHERE id = ${locationId};`
		);
	});

	it.each(['U', 'F', 'D'])('is true for record_type %s', async (recordType) => {
		const isResighting = await insertAndReadIsResighting(
			recordType,
			['U', 'F', 'D'].indexOf(recordType)
		);
		expect(isResighting).toBe(true);
	});

	it('is false for a real-capture record_type', async () => {
		const isResighting = await insertAndReadIsResighting('C', 10);
		expect(isResighting).toBe(false);
	});
});
