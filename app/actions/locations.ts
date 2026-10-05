'use server';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/app/lib/group-slug';

// A group's existing Location, trimmed to what the "rename" dropdown in
// UnrecognisedLocationsReview needs (#1080).
export type GroupLocationRow = { id: number; location_name: string };

// Lists the group's current Locations, ordered by name — the pick-list
// `UnrecognisedLocationsReview` offers for a "rename" decision. RLS already
// scopes this to the caller's group, but the query still filters on
// `ringing_group_id` explicitly (defence-in-depth), matching the convention
// `app/actions/ring-sequences.ts`'s `fetchRingSequences` already follows.
// Returns an empty array (not null) when the group has none yet.
export async function fetchGroupLocations(
	viewedGroup: ViewedGroup
): Promise<GroupLocationRow[] | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.from('Locations')
		.select('id, location_name')
		.eq('ringing_group_id', viewedGroup.id)
		.order('location_name')
		.then(catchSupabaseErrors) as Promise<GroupLocationRow[] | null>;
}

// One unrecognised CSV location name's resolution: either a genuinely new
// ringing site (insert), or a renamed existing one (update the chosen
// existing row's `location_name`, scoped to the group — see #1048's
// motivation in locations.ts's call site, app/(routes)/import/PageContent.tsx).
export type LocationDecision =
	| { name: string; kind: 'new' }
	| { name: string; kind: 'rename'; existingLocationId: number };

export type ResolveUnrecognisedLocationsState =
	| { success: true }
	| { success: false; error: string }
	| null;

function isValidDecision(value: unknown): value is LocationDecision {
	if (!value || typeof value !== 'object') return false;
	const decision = value as Record<string, unknown>;
	if (typeof decision.name !== 'string' || decision.name.trim() === '') {
		return false;
	}
	if (decision.kind === 'new') return true;
	if (decision.kind === 'rename') {
		return typeof decision.existingLocationId === 'number';
	}
	return false;
}

// Resolves #1079's `unrecognised_locations` import abort: the group decides,
// per unrecognised name, whether it's a new ringing site or a rename of an
// existing one. The whole `decisions` array is serialised into a single
// hidden form field (FormData has no native array-of-objects support) and
// parsed/validated here before any write happens — a malformed payload, or a
// `'rename'` decision missing `existingLocationId`, makes no writes at all.
// A "rename" is a plain `location_name` update, not a merge of two rows — see
// the ticket's Motivation for why that's safe (no mid-stream row-caching to
// worry about, since #1079 aborts before any import write happens).
export async function resolveUnrecognisedLocations(
	_prevState: ResolveUnrecognisedLocationsState,
	formData: FormData
): Promise<ResolveUnrecognisedLocationsState> {
	const ringingGroupId = Number(formData.get('viewed_group_id'));
	if (!ringingGroupId) {
		return { success: false, error: 'Missing group' };
	}

	const raw = formData.get('decisions');
	if (typeof raw !== 'string' || raw.trim() === '') {
		return { success: false, error: 'No location decisions submitted' };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { success: false, error: 'Malformed location decisions payload' };
	}

	if (!Array.isArray(parsed) || parsed.length === 0) {
		return { success: false, error: 'No location decisions submitted' };
	}
	if (!parsed.every(isValidDecision)) {
		return { success: false, error: 'Malformed location decision' };
	}
	const decisions = parsed as LocationDecision[];

	try {
		const supabase = await getAuthenticatedSupabaseClient();
		for (const decision of decisions) {
			if (decision.kind === 'new') {
				await supabase
					.from('Locations')
					.insert({
						location_name: decision.name,
						ringing_group_id: ringingGroupId
					})
					.then(catchSupabaseErrors);
			} else {
				await supabase
					.from('Locations')
					.update({ location_name: decision.name })
					.eq('id', decision.existingLocationId)
					.eq('ringing_group_id', ringingGroupId)
					.then(catchSupabaseErrors);
			}
		}
		return { success: true };
	} catch (error) {
		return { success: false, error: (error as Error).message };
	}
}
