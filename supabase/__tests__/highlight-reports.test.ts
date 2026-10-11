/**
 * Integration tests for HighlightReports RLS.
 *
 * Every authenticated group can insert a report and read reports back — no
 * group scoping, no anon access (reports always come from a logged-in
 * group). No UPDATE/DELETE policy exists, so reports are append-only. See
 * supabase/schema/schemas/public/tables/"HighlightReports".sql.
 *
 * Requires local Supabase running:
 *   npm run db:start:local
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect } from 'vitest';
import { supabase } from '../../lib/supabase';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import { randomTestSuffix } from './test-isolation';

async function getGroupIdByName(name: string): Promise<number> {
	const { data, error } = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('group_name', name)
		.single();
	if (error || !data) throw new Error(`Group "${name}" not found — run npm run db:seed:e2e first`);
	return data.id;
}

describe('HighlightReports RLS', () => {
	it('allows an authenticated group to insert a report', async () => {
		const alphaId = await getGroupIdByName('Alpha');
		const authenticatedClient = await getAuthenticatedSupabaseClientForGroup(alphaId);

		const { error } = await authenticatedClient.from('HighlightReports').insert({
			page_url: `https://example.test/summary-${randomTestSuffix()}`,
			highlight_text: `Test highlight ${randomTestSuffix()}`,
			reason: 'Looks wrong',
			highlight_body: { descriptor: { type: 'test' } }
		});
		expect(error).toBeNull();
	});

	it('allows an authenticated group to read reports back', async () => {
		const alphaId = await getGroupIdByName('Alpha');
		const authenticatedClient = await getAuthenticatedSupabaseClientForGroup(alphaId);
		const highlightText = `Readback highlight ${randomTestSuffix()}`;
		const { error: insertError } = await authenticatedClient
			.from('HighlightReports')
			.insert({
				page_url: `https://example.test/session-${randomTestSuffix()}`,
				highlight_text: highlightText,
				reason: 'Species looks mis-identified',
				highlight_body: { descriptor: { type: 'test' }, value: 42 }
			});
		expect(insertError).toBeNull();

		const { data, error } = await authenticatedClient
			.from('HighlightReports')
			.select('highlight_text, reason, highlight_body')
			.eq('highlight_text', highlightText)
			.single();
		expect(error).toBeNull();
		expect(data?.reason).toBe('Species looks mis-identified');
		expect(data?.highlight_body).toEqual({ descriptor: { type: 'test' }, value: 42 });
	});

	it('rejects an anonymous client inserting a report', async () => {
		const { error } = await supabase.from('HighlightReports').insert({
			page_url: `https://example.test/anon-${randomTestSuffix()}`,
			highlight_text: `Anon-rejected highlight ${randomTestSuffix()}`,
			reason: 'Should not be allowed',
			highlight_body: { descriptor: { type: 'test' } }
		});
		expect(error).not.toBeNull();
	});

	it('silently no-ops an update or delete against an existing report (no UPDATE/DELETE policy)', async () => {
		// With no UPDATE/DELETE policy, RLS filters the target row out of the
		// statement entirely — PostgREST reports this as a successful no-op (zero
		// rows affected, no error), not a permissions error. Confirmed against the
		// real local database rather than assumed.
		const alphaId = await getGroupIdByName('Alpha');
		const authenticatedClient = await getAuthenticatedSupabaseClientForGroup(alphaId);
		const highlightText = `Immutable highlight ${randomTestSuffix()}`;
		const { data: inserted, error: insertError } = await authenticatedClient
			.from('HighlightReports')
			.insert({
				page_url: `https://example.test/species-${randomTestSuffix()}`,
				highlight_text: highlightText,
				reason: 'Initial reason',
				highlight_body: { descriptor: { type: 'test' } }
			})
			.select('id')
			.single();
		expect(insertError).toBeNull();

		const { error: updateError } = await authenticatedClient
			.from('HighlightReports')
			.update({ reason: 'Changed reason' })
			.eq('id', inserted!.id);
		expect(updateError).toBeNull();

		const { error: deleteError } = await authenticatedClient
			.from('HighlightReports')
			.delete()
			.eq('id', inserted!.id);
		expect(deleteError).toBeNull();

		const { data: afterwards, error: selectError } = await authenticatedClient
			.from('HighlightReports')
			.select('reason')
			.eq('id', inserted!.id)
			.single();
		expect(selectError).toBeNull();
		expect(afterwards?.reason).toBe('Initial reason');
	});
});
