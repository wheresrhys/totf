import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClient } from './group-auth';
import { getGroupCookie } from '@/app/actions/group-cookie';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import { resolveGroupPublicAreasForRequest } from '../group-slug';
import type { CoreStatsResult } from '@/app/models/db';

// Shared param shape for both `core_stats` and `public_core_stats`
// (the two functions share an identical Args signature — see #772/#768).
// `ringing_group_filter` is supplied separately by the resolver below, since
// every caller of this module always scopes to one `viewedGroupId`.
export type CoreStatsRpcParams = {
	species_name_filter?: string;
	from_date?: string;
	to_date?: string;
	group_by_species?: boolean;
	group_by_time_period?: string;
};

export type GroupSummaryAccessLevel = 'own' | 'shared' | 'public' | 'blocked';

export type AuthorisedSummaryResult = {
	accessLevel: GroupSummaryAccessLevel;
	rows: CoreStatsResult[];
};

async function runCoreStats(
	rpcName: 'core_stats' | 'public_core_stats',
	client: SupabaseClient,
	viewedGroupId: number,
	rpcParams: CoreStatsRpcParams
): Promise<CoreStatsResult[]> {
	const rows = (await client
		.rpc(rpcName, { ringing_group_filter: viewedGroupId, ...rpcParams })
		.then(catchSupabaseErrors)) as CoreStatsResult[] | null;
	return rows ?? [];
}

// `core_stats` always emits at least one row for an ungrouped query
// (its spine is a 1x1 cross join, independent of RLS-visible data), so an
// RLS-blocked cross-group call never comes back as a literally-empty array —
// it comes back as a single row of COALESCEd zeros. This checks for that
// case too, so "blocked by RLS" and "no rows at all" (the grouped-query
// case) are both treated as "nothing visible here".
function hasVisibleData(rows: CoreStatsResult[]): boolean {
	return rows.length > 0 && rows.some((row) => row.encounter_count > 0);
}

/**
 * Resolves the correct read path for a group's aggregate summary stats, and
 * which of it actually reached the caller — see #770 for the full model.
 * `viewedGroupId` is the group whose data is being requested; the viewer is
 * derived internally from the session cookie (or its absence), never passed
 * in — this is deliberately not a cookie-presence check:
 *
 * 1. viewer's own group === target -> the viewer's existing authenticated
 *    client, unchanged, even if the result is genuinely empty (a group must
 *    always be able to see its own — possibly empty — summary).
 * 2. otherwise, check first (public-before-authenticated, #773 review) whether
 *    the target has opted its summary into public view (`public_areas`
 *    contains `'summary'`) -> if so, grant immediately via the SECURITY
 *    DEFINER `public_core_stats` RPC, which needs no JWT.
 *
 *    This is deliberately checked — and granted — before any
 *    `GroupDataSharing`-authorised attempt, even for a signed-in viewer who
 *    genuinely holds a sharing grant to the target: `public_core_stats`
 *    is a pure gated pass-through to `core_stats` for the same params
 *    (see its own SQL comment, `supabase/schema/schemas/public/functions/
 *    public_core_stats.sql`) — for a target that has opted in, it
 *    returns byte-identical rows to what the authenticated/RLS path would,
 *    so a sharing-authorised viewer is never shown a degraded view by
 *    granting on public status first. It also means an anonymous visitor
 *    (no session cookie at all) to a public target never needs to attempt —
 *    and have fail — an authenticated call first; the only place `rows`
 *    might legitimately differ between the two paths (accessLevel `'shared'`
 *    vs `'public'`) is the label, not the data, which is why no caller
 *    currently branches on `accessLevel` for that distinction.
 * 3. otherwise (target not public), fall through to the viewer's existing
 *    authenticated client if they have a session at all (covers an existing
 *    `GroupDataSharing` grant, RLS-enforced as before) — a no-cookie viewer
 *    is short-circuited to blocked without attempting this, since
 *    `getGroupCookie()` already tells us definitively there's no session to
 *    authenticate.
 * 4. none of the above -> blocked. No rows, no throw.
 *
 * Returns the access decision alongside the rows (not just the rows) so a
 * caller that cares which path served the data can destructure `accessLevel`
 * — every existing action function currently only destructures `rows`.
 */
export async function fetchAuthorisedCoreStats(
	viewedGroupId: number,
	rpcParams: CoreStatsRpcParams = {}
): Promise<AuthorisedSummaryResult> {
	const viewerGroupId = await getGroupCookie();

	if (viewerGroupId === viewedGroupId) {
		const client = await getAuthenticatedSupabaseClient();
		const rows = await runCoreStats(
			'core_stats',
			client,
			viewedGroupId,
			rpcParams
		);
		return { accessLevel: 'own', rows };
	}

	const publicAreas = await resolveGroupPublicAreasForRequest(viewedGroupId);
	if (publicAreas.includes('summary')) {
		const rows = await runCoreStats(
			'public_core_stats',
			supabase,
			viewedGroupId,
			rpcParams
		);
		return { accessLevel: 'public', rows };
	}

	if (!viewerGroupId) {
		return { accessLevel: 'blocked', rows: [] };
	}

	const client = await getAuthenticatedSupabaseClient();
	const sharedRows = await runCoreStats(
		'core_stats',
		client,
		viewedGroupId,
		rpcParams
	);

	if (hasVisibleData(sharedRows)) {
		return { accessLevel: 'shared', rows: sharedRows };
	}

	return { accessLevel: 'blocked', rows: [] };
}
