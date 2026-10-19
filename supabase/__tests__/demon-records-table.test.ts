/**
 * DB integration tests for the `DemonRecords` table's own schema — the dedup
 * constraint, FK enforcement and RLS — independent of the (not-yet-wired, see
 * sibling ticket #959) import write path.
 *
 * `DemonRecords` is the first stop for every imported CSV row (#960): a
 * near-verbatim staging copy keyed on (ringing_group_id, ring_no,
 * encounter_date, encounter_time), so re-importing an overlapping CSV upserts
 * onto the same row instead of duplicating it. See
 * supabase/schema/schemas/public/tables/"DemonRecords".sql.
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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import { ImportJobTracker } from '../../lib/demon-import';
import { createIsolatedGroup, psql } from './db-test-helpers';
import { randomTestSuffix, randomFutureDate } from './test-isolation';

type DemonRecordRowParams = {
	ringingGroupId: number;
	importJobId: number;
	ringNo: string;
	encounterDate?: string;
	encounterTime?: string;
	rawRow?: Record<string, unknown>;
};

/** Fixture builder: flat params merged over sensible defaults. */
function buildDemonRecordRow({
	ringingGroupId,
	importJobId,
	ringNo,
	encounterDate = randomFutureDate(),
	encounterTime = '09:00:00',
	rawRow,
}: DemonRecordRowParams) {
	return {
		ringing_group_id: ringingGroupId,
		import_job_id: importJobId,
		ring_no: ringNo,
		encounter_date: encounterDate,
		encounter_time: encounterTime,
		raw_row: rawRow ?? { ring_no: ringNo, visit_date: encounterDate, capture_time: encounterTime },
	};
}

describe('DemonRecords table', () => {
	const suffix = randomTestSuffix();
	let ownerGroupId: number;
	let otherGroupId: number;
	let ownerClient: SupabaseClient;
	let otherClient: SupabaseClient;
	let ownerImportJobId: number;
	let otherImportJobId: number;

	beforeAll(async () => {
		ownerGroupId = createIsolatedGroup(`dr-owner-${suffix}`);
		otherGroupId = createIsolatedGroup(`dr-other-${suffix}`);
		[ownerClient, otherClient] = await Promise.all([
			getAuthenticatedSupabaseClientForGroup(ownerGroupId),
			getAuthenticatedSupabaseClientForGroup(otherGroupId),
		]);
		[ownerImportJobId, otherImportJobId] = await Promise.all([
			new ImportJobTracker(ownerClient).createImportJob(ownerGroupId),
			new ImportJobTracker(otherClient).createImportJob(otherGroupId),
		]);
	});

	afterAll(() => {
		// DemonRecords has no ON DELETE CASCADE on either FK (matching
		// Encounters' convention), so child rows must go before the groups —
		// deleting the groups then cascades away their ImportJobs rows.
		psql(
			`DELETE FROM "DemonRecords" WHERE ringing_group_id IN (${ownerGroupId}, ${otherGroupId});` +
				`DELETE FROM "RingingGroups" WHERE id IN (${ownerGroupId}, ${otherGroupId});`
		);
	});

	describe('DemonRecords unique constraint', () => {
		afterAll(() => {
			psql(`DELETE FROM "DemonRecords" WHERE ringing_group_id IN (${ownerGroupId}, ${otherGroupId});`);
		});

		it('upserts onto the same row when (ringing_group_id, ring_no, encounter_date, encounter_time) repeats', async () => {
			const ringNo = `DR-UPSERT-${suffix}`;
			const encounterDate = randomFutureDate();
			const row = buildDemonRecordRow({
				ringingGroupId: ownerGroupId,
				importJobId: ownerImportJobId,
				ringNo,
				encounterDate,
			});

			const first = await ownerClient
				.from('DemonRecords')
				.upsert(row, { onConflict: 'ringing_group_id,ring_no,encounter_date,encounter_time' })
				.select('id')
				.single();
			expect(first.error).toBeNull();

			const second = await ownerClient
				.from('DemonRecords')
				.upsert(
					{ ...row, raw_row: { ...row.raw_row, species_name: 'Robin' } },
					{ onConflict: 'ringing_group_id,ring_no,encounter_date,encounter_time' }
				)
				.select('id')
				.single();
			expect(second.error).toBeNull();
			expect(second.data?.id).toBe(first.data?.id);

			const { data: matches, error } = await ownerClient
				.from('DemonRecords')
				.select('id')
				.eq('ringing_group_id', ownerGroupId)
				.eq('ring_no', ringNo)
				.eq('encounter_date', encounterDate);
			expect(error).toBeNull();
			expect(matches).toHaveLength(1);
		});

		it('inserts two distinct rows when encounter_date differs for the same ring/group', async () => {
			const ringNo = `DR-DATE-${suffix}`;
			const firstDate = randomFutureDate();
			const secondDate = randomFutureDate();

			const firstInsert = await ownerClient
				.from('DemonRecords')
				.insert(
					buildDemonRecordRow({
						ringingGroupId: ownerGroupId,
						importJobId: ownerImportJobId,
						ringNo,
						encounterDate: firstDate,
					})
				);
			expect(firstInsert.error).toBeNull();

			const secondInsert = await ownerClient
				.from('DemonRecords')
				.insert(
					buildDemonRecordRow({
						ringingGroupId: ownerGroupId,
						importJobId: ownerImportJobId,
						ringNo,
						encounterDate: secondDate,
					})
				);
			expect(secondInsert.error).toBeNull();

			const { data: matches, error } = await ownerClient
				.from('DemonRecords')
				.select('id')
				.eq('ringing_group_id', ownerGroupId)
				.eq('ring_no', ringNo);
			expect(error).toBeNull();
			expect(matches).toHaveLength(2);
		});

		it('inserts two distinct rows when encounter_time differs for the same ring/group/date', async () => {
			const ringNo = `DR-TIME-${suffix}`;
			const encounterDate = randomFutureDate();

			const firstInsert = await ownerClient.from('DemonRecords').insert(
				buildDemonRecordRow({
					ringingGroupId: ownerGroupId,
					importJobId: ownerImportJobId,
					ringNo,
					encounterDate,
					encounterTime: '08:00:00',
				})
			);
			expect(firstInsert.error).toBeNull();

			const secondInsert = await ownerClient.from('DemonRecords').insert(
				buildDemonRecordRow({
					ringingGroupId: ownerGroupId,
					importJobId: ownerImportJobId,
					ringNo,
					encounterDate,
					encounterTime: '14:30:00',
				})
			);
			expect(secondInsert.error).toBeNull();

			const { data: matches, error } = await ownerClient
				.from('DemonRecords')
				.select('id')
				.eq('ringing_group_id', ownerGroupId)
				.eq('ring_no', ringNo)
				.eq('encounter_date', encounterDate);
			expect(error).toBeNull();
			expect(matches).toHaveLength(2);
		});

		it('inserts two distinct rows for the same ring/date/time across two different ringing_group_id values', async () => {
			const ringNo = `DR-CROSS-GROUP-${suffix}`;
			const encounterDate = randomFutureDate();
			const encounterTime = '11:00:00';

			const ownerInsert = await ownerClient.from('DemonRecords').insert(
				buildDemonRecordRow({
					ringingGroupId: ownerGroupId,
					importJobId: ownerImportJobId,
					ringNo,
					encounterDate,
					encounterTime,
				})
			);
			expect(ownerInsert.error).toBeNull();

			const otherInsert = await otherClient.from('DemonRecords').insert(
				buildDemonRecordRow({
					ringingGroupId: otherGroupId,
					importJobId: otherImportJobId,
					ringNo,
					encounterDate,
					encounterTime,
				})
			);
			expect(otherInsert.error).toBeNull();
		});
	});

	describe('DemonRecords import_job_id foreign key', () => {
		afterAll(() => {
			psql(`DELETE FROM "DemonRecords" WHERE ringing_group_id = ${ownerGroupId};`);
		});

		it('inserts successfully with a valid import_job_id', async () => {
			const { error } = await ownerClient.from('DemonRecords').insert(
				buildDemonRecordRow({
					ringingGroupId: ownerGroupId,
					importJobId: ownerImportJobId,
					ringNo: `DR-VALID-JOB-${suffix}`,
				})
			);
			expect(error).toBeNull();
		});

		it('rejects an insert with a nonexistent import_job_id', async () => {
			const nonExistentImportJobId = 999999999;
			const { error } = await ownerClient.from('DemonRecords').insert(
				buildDemonRecordRow({
					ringingGroupId: ownerGroupId,
					importJobId: nonExistentImportJobId,
					ringNo: `DR-INVALID-JOB-${suffix}`,
				})
			);
			expect(error).not.toBeNull();
			expect(error?.code).toBe('23503'); // foreign_key_violation
		});
	});

	describe('DemonRecords ringing_group_id foreign key', () => {
		it('rejects an insert with a nonexistent ringing_group_id', () => {
			// Bypasses RLS via raw psql: an authenticated client's own jwt
			// ringing_group_id is always a real group, so there is no client-side
			// route to a nonexistent group id — the policy, not the FK, would
			// reject it first. This isolates the FK constraint itself, mirroring
			// supabase/__tests__/ring-sequences-birds-table.test.ts's raw-insert
			// FK tests.
			const nonExistentGroupId = 999999999;
			const row = buildDemonRecordRow({
				ringingGroupId: nonExistentGroupId,
				importJobId: ownerImportJobId,
				ringNo: `DR-INVALID-GROUP-${suffix}`,
			});
			expect(() =>
				psql(
					`INSERT INTO "DemonRecords" (ringing_group_id, import_job_id, ring_no, encounter_date, encounter_time, raw_row) ` +
						`VALUES (${nonExistentGroupId}, ${ownerImportJobId}, '${row.ring_no}', '${row.encounter_date}', '${row.encounter_time}', '${JSON.stringify(row.raw_row)}');`
				)
			).toThrow();
		});
	});

	describe('DemonRecords row level security', () => {
		afterAll(() => {
			psql(
				`DELETE FROM "GroupDataSharing" WHERE granter_group_id = ${ownerGroupId} AND recipient_group_id = ${otherGroupId};` +
					`DELETE FROM "DemonRecords" WHERE ringing_group_id IN (${ownerGroupId}, ${otherGroupId});`
			);
		});

		it('allows a group to select its own DemonRecords rows', async () => {
			const ringNo = `DR-RLS-OWN-SELECT-${suffix}`;
			const inserted = await ownerClient
				.from('DemonRecords')
				.insert(buildDemonRecordRow({ ringingGroupId: ownerGroupId, importJobId: ownerImportJobId, ringNo }))
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const { data, error } = await ownerClient.from('DemonRecords').select('id').eq('id', inserted.data!.id);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
		});

		it('allows a group to insert a DemonRecords row for itself', async () => {
			const { data, error } = await ownerClient
				.from('DemonRecords')
				.insert(
					buildDemonRecordRow({
						ringingGroupId: ownerGroupId,
						importJobId: ownerImportJobId,
						ringNo: `DR-RLS-OWN-INSERT-${suffix}`,
					})
				)
				.select('ringing_group_id')
				.single();
			expect(error).toBeNull();
			expect(data?.ringing_group_id).toBe(ownerGroupId);
		});

		it("blocks a group from selecting another group's DemonRecords rows with no data-sharing grant", async () => {
			const inserted = await ownerClient
				.from('DemonRecords')
				.insert(
					buildDemonRecordRow({
						ringingGroupId: ownerGroupId,
						importJobId: ownerImportJobId,
						ringNo: `DR-RLS-NO-SHARE-${suffix}`,
					})
				)
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			const { data, error } = await otherClient.from('DemonRecords').select('id').eq('id', inserted.data!.id);
			expect(error).toBeNull();
			expect(data).toEqual([]);
		});

		it("allows a group to select another group's DemonRecords rows when GroupDataSharing grants it", async () => {
			const inserted = await ownerClient
				.from('DemonRecords')
				.insert(
					buildDemonRecordRow({
						ringingGroupId: ownerGroupId,
						importJobId: ownerImportJobId,
						ringNo: `DR-RLS-SHARED-${suffix}`,
					})
				)
				.select('id')
				.single();
			expect(inserted.error).toBeNull();

			psql(
				`INSERT INTO "GroupDataSharing" (granter_group_id, recipient_group_id) VALUES (${ownerGroupId}, ${otherGroupId});`
			);

			const { data, error } = await otherClient.from('DemonRecords').select('id').eq('id', inserted.data!.id);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
		});

		it('blocks a group from inserting a DemonRecords row for another ringing_group_id', async () => {
			const { error } = await otherClient.from('DemonRecords').insert(
				buildDemonRecordRow({
					ringingGroupId: ownerGroupId,
					importJobId: ownerImportJobId,
					ringNo: `DR-RLS-BLOCKED-INSERT-${suffix}`,
				})
			);
			expect(error).not.toBeNull();
		});
	});

	describe('DemonRecords updated_at column', () => {
		afterAll(() => {
			psql(`DELETE FROM "DemonRecords" WHERE ringing_group_id = ${ownerGroupId};`);
		});

		it('defaults updated_at to the insert time when not explicitly provided', async () => {
			const before = Date.now();
			const { data, error } = await ownerClient
				.from('DemonRecords')
				.insert(
					buildDemonRecordRow({
						ringingGroupId: ownerGroupId,
						importJobId: ownerImportJobId,
						ringNo: `DR-UPDATED-AT-${suffix}`,
					})
				)
				.select('updated_at')
				.single();
			const after = Date.now();

			expect(error).toBeNull();
			expect(data?.updated_at).not.toBeNull();
			const updatedAtMs = new Date(data!.updated_at).getTime();
			expect(updatedAtMs).toBeGreaterThanOrEqual(before - 1000);
			expect(updatedAtMs).toBeLessThanOrEqual(after + 1000);
		});
	});
});
