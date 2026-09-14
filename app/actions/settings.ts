'use server';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { getGroupCookie } from './group-cookie';

// `public_areas` isn't in the generated Supabase types yet — it lands with
// #768's schema migration (a prerequisite for this to persist meaningfully in
// prod, but not required to develop/test this action — see #769).
// `getAuthenticatedSupabaseClient()` already returns an untyped
// `SupabaseClient` (see e.g. app/actions/bird-encounters.ts), so referencing
// the column here doesn't need any extra type workaround.
const PUBLIC_SUMMARY_AREA = 'summary';

export type UpdatePublicSummaryEnabledResult =
	| { success: true; enabled: boolean }
	| { success: false; error: string };

export async function fetchOwnGroupPublicAreas(
	groupId: number
): Promise<string[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const group = await supabase
		.from('RingingGroups')
		.select('public_areas')
		.eq('id', groupId)
		.single()
		.then(catchSupabaseErrors);
	return (group?.public_areas as string[] | null) ?? [];
}

// Never takes an explicit group id param — it always reads the caller's own
// group id from the session cookie (the same JWT getAuthenticatedSupabaseClient()
// signs into its request), so it can only ever act on the caller's own
// RingingGroups row. Enforced defence-in-depth by the ringing_groups_update
// RLS policy.
export async function updatePublicSummaryEnabled(
	enabled: boolean
): Promise<UpdatePublicSummaryEnabledResult> {
	try {
		const groupId = await getGroupCookie();
		if (groupId === null) {
			return { success: false, error: 'No group selected' };
		}

		const currentAreas = await fetchOwnGroupPublicAreas(groupId);
		const nextAreas = enabled
			? Array.from(new Set([...currentAreas, PUBLIC_SUMMARY_AREA]))
			: currentAreas.filter((area) => area !== PUBLIC_SUMMARY_AREA);

		const supabase = await getAuthenticatedSupabaseClient();
		await supabase
			.from('RingingGroups')
			.update({ public_areas: nextAreas })
			.eq('id', groupId)
			.then(catchSupabaseErrors);

		return { success: true, enabled };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to update setting'
		};
	}
}
