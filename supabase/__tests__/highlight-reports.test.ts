/**
 * Integration tests for HighlightReports RLS.
 *
 * The table is deliberately public: anyone (anon or authenticated) can insert a
 * report and read reports back, but no UPDATE/DELETE policy exists. See
 * supabase/schema/schemas/public/tables/"HighlightReports".sql.
 *
 * Requires local Supabase running:
 *   npm run db:start:local
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect } from 'vitest';
import { supabase } from '../../lib/supabase';
import { randomTestSuffix } from './test-isolation';

describe('HighlightReports RLS', () => {
	it('allows an anonymous client to insert a report', async () => {
		const { error } = await supabase.from('HighlightReports').insert({
			page_url: `https://example.test/summary-${randomTestSuffix()}`,
			highlight_text: `Test highlight ${randomTestSuffix()}`,
			reason: 'Looks wrong',
			highlight_body: { descriptor: { type: 'test' } }
		});
		expect(error).toBeNull();
	});

	it('allows an anonymous client to read reports back', async () => {
		const highlightText = `Readback highlight ${randomTestSuffix()}`;
		const { error: insertError } = await supabase.from('HighlightReports').insert({
			page_url: `https://example.test/session-${randomTestSuffix()}`,
			highlight_text: highlightText,
			reason: 'Species looks mis-identified',
			highlight_body: { descriptor: { type: 'test' }, value: 42 }
		});
		expect(insertError).toBeNull();

		const { data, error } = await supabase
			.from('HighlightReports')
			.select('highlight_text, reason, highlight_body')
			.eq('highlight_text', highlightText)
			.single();
		expect(error).toBeNull();
		expect(data?.reason).toBe('Species looks mis-identified');
		expect(data?.highlight_body).toEqual({ descriptor: { type: 'test' }, value: 42 });
	});

	it('silently no-ops an update or delete against an existing report (no UPDATE/DELETE policy)', async () => {
		// With no UPDATE/DELETE policy, RLS filters the target row out of the
		// statement entirely — PostgREST reports this as a successful no-op (zero
		// rows affected, no error), not a permissions error. Confirmed against the
		// real local database rather than assumed.
		const highlightText = `Immutable highlight ${randomTestSuffix()}`;
		const { data: inserted, error: insertError } = await supabase
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

		const { error: updateError } = await supabase
			.from('HighlightReports')
			.update({ reason: 'Changed reason' })
			.eq('id', inserted!.id);
		expect(updateError).toBeNull();

		const { error: deleteError } = await supabase
			.from('HighlightReports')
			.delete()
			.eq('id', inserted!.id);
		expect(deleteError).toBeNull();

		const { data: afterwards, error: selectError } = await supabase
			.from('HighlightReports')
			.select('reason')
			.eq('id', inserted!.id)
			.single();
		expect(selectError).toBeNull();
		expect(afterwards?.reason).toBe('Initial reason');
	});
});
