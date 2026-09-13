import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGroupCookie } from '../../../actions/group-cookie';
import { getAuthenticatedSupabaseClient } from '../group-auth';
import { resolveGroupPublicAreasForRequest } from '../../group-slug';
import type { AggregateStatsWithBiometrics } from '@/app/models/db';

const { mockPublicSupabaseFrom, mockPublicSupabaseRpc } = vi.hoisted(() => ({
	mockPublicSupabaseFrom: vi.fn(),
	mockPublicSupabaseRpc: vi.fn()
}));

vi.mock('../group-auth', () => ({
	getAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/group-slug', () => ({
	resolveGroupPublicAreasForRequest: vi.fn()
}));

vi.mock('@/lib/supabase', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/supabase')>();
	return {
		...actual,
		supabase: { from: mockPublicSupabaseFrom, rpc: mockPublicSupabaseRpc }
	};
});

import { fetchAuthorisedCoreStats } from '../group-summary-access';

// Only `encounter_count` matters to the access-resolution logic under test
// (it's the "is there anything real here" signal); every other field is
// filled with an inert default so the fixture satisfies `AggregateStatsWithBiometrics`
// (a Postgres composite type — every column comes back non-null, see
// app/models/db.ts).
function buildStatsRow(
	overrides: Partial<AggregateStatsWithBiometrics> = {}
): AggregateStatsWithBiometrics {
	return {
		species_name: 'Robin',
		time_period: '2026-01-01',
		session_count: 0,
		total_effort: '00:00:00',
		effort_per_session: '00:00:00',
		effort_per_encounter: '00:00:00',
		avg_encounters_per_session: 0,
		max_per_session: 0,
		species_count: 0,
		bird_count: 0,
		encounter_count: 0,
		new_bird_count: 0,
		pullus_bird_count: 0,
		juv_bird_count: 0,
		postjuv_bird_count: 0,
		adult_bird_count: 0,
		unknown_age_bird_count: 0,
		pullus_enc_count: 0,
		juv_enc_count: 0,
		postjuv_enc_count: 0,
		adult_enc_count: 0,
		unknown_age_enc_count: 0,
		max_new_per_session: 0,
		max_weight: 0,
		avg_weight: 0,
		min_weight: 0,
		median_weight: 0,
		max_wing: 0,
		avg_wing: 0,
		min_wing: 0,
		median_wing: 0,
		...overrides
	};
}

function makeAuthenticatedClient(rows: AggregateStatsWithBiometrics[] | null) {
	return {
		rpc: vi.fn().mockReturnValue({
			then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
				Promise.resolve({ data: rows, error: null }).then(resolve)
		})
	};
}

function mockPublicRpcReturning(rows: AggregateStatsWithBiometrics[] | null) {
	mockPublicSupabaseRpc.mockReturnValue({
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: rows, error: null }).then(resolve)
	});
}

const VIEWED_GROUP_ID = 10;

describe('summary read-path access model', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('own group, logged in', () => {
		it('sees its own summary data exactly as before, via the authenticated client', async () => {
			vi.mocked(getGroupCookie).mockResolvedValue(VIEWED_GROUP_ID);
			const ownRows = [buildStatsRow({ encounter_count: 5 })];
			const client = makeAuthenticatedClient(ownRows);
			vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue(
				client as never
			);

			const result = await fetchAuthorisedCoreStats(VIEWED_GROUP_ID);

			expect(result).toEqual({ accessLevel: 'own', rows: ownRows });
			expect(resolveGroupPublicAreasForRequest).not.toHaveBeenCalled();
		});

		it("sees its own genuinely empty summary as 'own', never falls through to blocked", async () => {
			vi.mocked(getGroupCookie).mockResolvedValue(VIEWED_GROUP_ID);
			const emptyRows = [buildStatsRow({ encounter_count: 0 })];
			const client = makeAuthenticatedClient(emptyRows);
			vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue(
				client as never
			);

			const result = await fetchAuthorisedCoreStats(VIEWED_GROUP_ID);

			expect(result.accessLevel).toBe('own');
			expect(resolveGroupPublicAreasForRequest).not.toHaveBeenCalled();
		});
	});

	describe('different group, logged in, no sharing grant', () => {
		beforeEach(() => {
			vi.mocked(getGroupCookie).mockResolvedValue(99);
			const rlsBlockedRows = [buildStatsRow({ encounter_count: 0 })];
			const client = makeAuthenticatedClient(rlsBlockedRows);
			vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue(
				client as never
			);
		});

		it('target not public: blocked (gated), not a 500', async () => {
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([]);

			const result = await fetchAuthorisedCoreStats(VIEWED_GROUP_ID);

			expect(result).toEqual({ accessLevel: 'blocked', rows: [] });
		});

		it('target public: sees target public summary data via public_core_stats', async () => {
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([
				'summary'
			]);
			const publicRows = [buildStatsRow({ encounter_count: 42 })];
			mockPublicRpcReturning(publicRows);

			const result = await fetchAuthorisedCoreStats(VIEWED_GROUP_ID);

			expect(result).toEqual({ accessLevel: 'public', rows: publicRows });
			expect(mockPublicSupabaseRpc).toHaveBeenCalledWith(
				'public_core_stats',
				expect.objectContaining({ ringing_group_filter: VIEWED_GROUP_ID })
			);
		});
	});

	describe('different group, logged in, existing sharing grant', () => {
		it('target not public: sees data via the authenticated path (public check ran first, found nothing, fell through)', async () => {
			vi.mocked(getGroupCookie).mockResolvedValue(99);
			const sharedRows = [buildStatsRow({ encounter_count: 17 })];
			const client = makeAuthenticatedClient(sharedRows);
			vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue(
				client as never
			);
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([]);

			const result = await fetchAuthorisedCoreStats(VIEWED_GROUP_ID);

			expect(result).toEqual({ accessLevel: 'shared', rows: sharedRows });
			expect(mockPublicSupabaseRpc).not.toHaveBeenCalled();
		});

		it('target also public: still gets its (identical) data, granted via the public path — the authenticated client is never even called', async () => {
			vi.mocked(getGroupCookie).mockResolvedValue(99);
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([
				'summary'
			]);
			const publicRows = [buildStatsRow({ encounter_count: 17 })];
			mockPublicRpcReturning(publicRows);

			const result = await fetchAuthorisedCoreStats(VIEWED_GROUP_ID);

			// accessLevel is 'public' rather than 'shared' here — a deliberate
			// labelling tradeoff (see fetchAuthorisedCoreStats's own
			// comment): public_core_stats returns byte-identical rows to
			// the authenticated path for an opted-in target, so the sharing
			// grant is never exercised (and never needs to be) once the
			// target is public.
			expect(result).toEqual({ accessLevel: 'public', rows: publicRows });
			expect(getAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		});
	});

	describe('no cookie (anonymous)', () => {
		beforeEach(() => {
			vi.mocked(getGroupCookie).mockResolvedValue(null);
			// Left un-mocked (would reject if called, like the real "no session
			// cookie" case) deliberately: with the public-before-authenticated
			// order, an anonymous viewer never reaches the authenticated
			// attempt at all — see the two assertions below — so there's
			// nothing here for a rejection to short-circuit past any more.
		});

		it('target public: sees target public summary data, without ever attempting the authenticated client', async () => {
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([
				'summary'
			]);
			const publicRows = [buildStatsRow({ encounter_count: 3 })];
			mockPublicRpcReturning(publicRows);

			const result = await fetchAuthorisedCoreStats(VIEWED_GROUP_ID);

			expect(result).toEqual({ accessLevel: 'public', rows: publicRows });
			expect(getAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		});

		it('target not public: gated gracefully without ever attempting the authenticated client, not a 500', async () => {
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([]);

			await expect(fetchAuthorisedCoreStats(VIEWED_GROUP_ID)).resolves.toEqual({
				accessLevel: 'blocked',
				rows: []
			});
			expect(getAuthenticatedSupabaseClient).not.toHaveBeenCalled();
		});
	});

	describe('edge cases', () => {
		it('target group has zero sessions and is public: renders empty state via public_core_stats, not mistaken for blocked', async () => {
			vi.mocked(getGroupCookie).mockResolvedValue(null);
			vi.mocked(getAuthenticatedSupabaseClient).mockRejectedValue(
				new Error('No group selected')
			);
			vi.mocked(resolveGroupPublicAreasForRequest).mockResolvedValue([
				'summary'
			]);
			const genuinelyEmptyRows = [buildStatsRow({ encounter_count: 0 })];
			mockPublicRpcReturning(genuinelyEmptyRows);

			const result = await fetchAuthorisedCoreStats(VIEWED_GROUP_ID);

			expect(result.accessLevel).toBe('public');
			expect(result.rows).toEqual(genuinelyEmptyRows);
		});
	});
});
