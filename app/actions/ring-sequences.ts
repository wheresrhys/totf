'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors, fetchAllPaginatedRows } from '@/lib/supabase';
import {
	groupRingNosByPrefix,
	type UnassignedImportPrefix
} from '@/app/models/ring-sequences';
import type { RingSequenceRow, RingSize } from '@/app/models/db';

export type RingSequenceControlRow = {
	ring_no: string;
	species_name: string;
	first_date: string;
};

export async function fetchRingSequenceControls(
	viewedGroupId: number
): Promise<RingSequenceControlRow[] | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('ring_sequence_controls', { ringing_group_filter: viewedGroupId })
		.then(catchSupabaseErrors) as Promise<RingSequenceControlRow[] | null>;
}

// --- New read/write path off the `RingSequences` table (issue #660) ---
//
// These read directly from the `RingSequences` table rather than the RPCs
// above. RLS scopes every query to the caller's group; where a query already
// has the viewed group id to hand it also filters on `ringing_group_id`
// explicitly (defence-in-depth), rather than leaning on RLS alone.

// A single bird belonging to a ring sequence, flattened from the embedded
// `Birds`→`Species`/`Encounters`→`Sessions` select for rendering.
export type RingSequenceBirdRow = {
	ring_no: string;
	species_name: string;
	ringed_date: string;
};

export type UpdateRingSequenceState =
	| { success: true }
	| { success: false; error: string }
	| null;

// Lists this group's ring sequences, ordered by prefix. Returns an empty array
// (not null) when the group has none yet, so the page renders an empty state.
// RLS already scopes the result to the caller's group, but the query still
// filters on `ringing_group_id` explicitly so it asks only for the data it
// needs (defence-in-depth, not relying on RLS alone).
export async function fetchRingSequences(
	viewedGroupId: number
): Promise<RingSequenceRow[] | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.from('RingSequences')
		.select('*')
		.eq('ringing_group_id', viewedGroupId)
		.order('prefix')
		.then(catchSupabaseErrors) as Promise<RingSequenceRow[] | null>;
}

// Lists the group's first-3-character ring prefixes whose birds are newly ringed
// (`record_type = 'N'`) but not yet assigned to any ring sequence — the raw
// material the Ring Sequences page offers for sequence creation (issue #697).
// An `!inner` join to `Encounters` restricts the result to birds with at least
// one `N` encounter, and `contains('ringing_group_ids', [groupId])` scopes to
// this group's birds (RLS on Birds is only partially implemented — see issue
// #149 — and a bird can be shared across groups, so the group id must appear in
// the array). A separate read of the group's `RingSequences_Birds` links then
// drops any bird already assigned to a sequence (assignment lives in that
// per-group link table now, not a `Birds.ring_sequence_id` column — see #703).
// Grouping the survivors into prefixes is the pure `groupRingNosByPrefix` model
// function.
export async function fetchUnassignedImportPrefixes(
	viewedGroupId: number
): Promise<UnassignedImportPrefix[] | null> {
	const supabase = await getAuthenticatedSupabaseClient();

	const birds = (await fetchAllPaginatedRows<{ id: number; ring_no: string }>(
		(fromRow, toRow) =>
			supabase
				.from('Birds')
				.select('id, ring_no, encounters:Encounters!inner(record_type)')
				.eq('encounters.record_type', 'N')
				.contains('ringing_group_ids', [viewedGroupId])
				.order('ring_no')
				.range(fromRow, toRow)
	)) as { id: number; ring_no: string }[] | null;

	if (birds === null) return null;
	if (birds.length === 0) return [];

	const assigned = (await fetchAllPaginatedRows<{ bird_id: number }>(
		(fromRow, toRow) =>
			supabase
				.from('RingSequences_Birds')
				.select('bird_id')
				.eq('ringing_group_id', viewedGroupId)
				.order('id')
				.range(fromRow, toRow)
	)) as { bird_id: number }[] | null;

	if (assigned === null) return null;
	const assignedBirdIds = new Set(assigned.map(({ bird_id }) => bird_id));
	console.log(assignedBirdIds)
	const unassigned = birds.filter(({ id }) => !assignedBirdIds.has(id));
	return groupRingNosByPrefix(unassigned);
}

// Birds belonging to one ring sequence: newly-ringed birds (`record_type = 'N'`)
// whose ring number starts with the sequence's `prefix` and matches the exact
// length of its `first_ring`. PostgREST has no `LENGTH()` filter, so the exact
// length is expressed as an `ilike` pattern of the prefix followed by one `_`
// wildcard per remaining character — replicating what `ring_sequence_detail`'s
// `LENGTH(b.ring_no) = ring_length_filter` did, via the query builder.
export async function fetchRingSequenceBirds(
	ringSequenceId: number
): Promise<RingSequenceBirdRow[] | null> {
	const supabase = await getAuthenticatedSupabaseClient();

	type BirdQueryRow = {
		ring_no: string;
		species: { species_name: string } | null;
		encounters: { session: { visit_date: string } | null }[];
	};
	const birdsInSequence = (await supabase
		.from('RingSequences_Birds')
		.select(
			`
			bird:Birds!inner(
				ring_no,
				species:Species(species_name),
				encounters:Encounters!inner(
					session:Sessions(visit_date)
				)
			)
		`
		)
		.eq('ring_sequence_id', ringSequenceId)
		.then(catchSupabaseErrors)) as { bird: BirdQueryRow }[] | null;

	return (birdsInSequence || []).map(({ bird }) => ({
		ring_no: bird.ring_no,
		species_name: bird.species?.species_name ?? '',
		ringed_date: bird.encounters[0]?.session?.visit_date ?? ''
	}));
}

// Updates a ring sequence's `size`. `prefix` is a fixed identity for a
// sequence (enforced via a DB CHECK constraint — see #729) and is never read
// from the submitted form, even if a `prefix` field is present. RLS enforces
// the group boundary, so no manual `ringing_group_id` check is needed. Mirrors
// the `LoginState` result-shape convention: any thrown `catchSupabaseErrors`
// error is surfaced via `.message`.
export async function updateRingSequence(
	_prevState: UpdateRingSequenceState,
	formData: FormData
): Promise<UpdateRingSequenceState> {
	const id = Number(formData.get('id'));
	const size = formData.get('size') as string;

	if (!size) {
		return { success: false, error: 'Please select a ring size' };
	}

	try {
		const supabase = await getAuthenticatedSupabaseClient();
		await supabase
			.from('RingSequences')
			.update({ size: size as RingSize })
			.eq('id', id)
			.then(catchSupabaseErrors);
		return { success: true };
	} catch (error) {
		return { success: false, error: (error as Error).message };
	}
}

// Result shape for `promoteControlToSequence`. Mirrors `UpdateRingSequenceState`
// / `LoginState`: a discriminated union rather than a thrown error, so the
// client modal can react without crossing the server-action boundary with an
// exception.
export type PromoteControlState =
	| { success: true }
	| { success: false; error: string }
	| null;

// Postgres unique-constraint violation SQLSTATE (raised on the
// `(prefix, ringing_group_id)` unique index if two promotes for the same prefix
// race). `catchSupabaseErrors` collapses the error to a message and loses the
// code, so the insert below inspects the raw PostgREST error itself.
const UNIQUE_VIOLATION = '23505';

type PromoteSupabaseClient = Awaited<
	ReturnType<typeof getAuthenticatedSupabaseClient>
>;

// Options controlling how a newly-created RingSequences row is shaped. Both call
// sites reuse an existing row untouched (never overwriting its `owned_by_group`,
// `size`, or bounds — the importer or a prior manual edit may have set them);
// these only apply when a row is inserted:
//   - promote-control (issue #661): a foreign sequence being tracked, so
//     `owned_by_group = false` and no bounds (defaults below).
//   - create-from-import-prefix (issue #697): the group's own newly-ringed
//     birds, so `owned_by_group = true` with UI-suggested `first_ring`/
//     `last_ring` bounds.
type CreateSequenceOptions = {
	ownedByGroup?: boolean;
	firstRing?: string | null;
	lastRing?: string | null;
};

// Finds or creates the group's RingSequences row for `prefix`, then links every
// currently-untracked bird sharing that prefix to it via the per-group
// `RingSequences_Birds` link table. Every bird sharing the prefix is linked
// together — not just the one that triggered the action — since they're
// indistinguishable once tracked. Reusing an existing row never overwrites its
// `owned_by_group`, `size`, or bounds. There is no more bounds-widening trigger
// (see #701), so a newly-created row's bounds are whatever `options` supplies
// (null unless the caller passes them). RLS scopes every query to the caller's
// group; the explicit `ringing_group_id` filter is defence-in-depth.
async function findOrCreateRingSequenceAndLinkBirds(
	supabase: PromoteSupabaseClient,
	prefix: string,
	groupId: number,
	options: CreateSequenceOptions = {}
): Promise<number> {
	const { ownedByGroup = false, firstRing = null, lastRing = null } = options;
	const existing = (await supabase
		.from('RingSequences')
		.select('id')
		.eq('prefix', prefix)
		// TODO this shoudl also probably check against first and last values
		.eq('ringing_group_id', groupId)
		.maybeSingle()
		.then(catchSupabaseErrors)) as { id: number } | null;

	let sequenceId: number;
	if (existing?.id) {
		sequenceId = existing.id;
	} else {
		const { data: inserted, error } = await supabase
			.from('RingSequences')
			.insert({
				prefix,
				ringing_group_id: groupId,
				owned_by_group: ownedByGroup,
				size: null,
				// Only include the bounds columns when the caller supplied them, so
				// the promote path's insert payload stays exactly as it was.
				...(firstRing !== null ? { first_ring: firstRing } : {}),
				...(lastRing !== null ? { last_ring: lastRing } : {})
			})
			.select('id')
			.single();

		if (error) {
			// A concurrent promote for the same prefix won the race and inserted
			// the row first — re-select and reuse it rather than surfacing a hard
			// error.
			if (error.code === UNIQUE_VIOLATION) {
				const raced = (await supabase
					.from('RingSequences')
					.select('id')
					.eq('prefix', prefix)
					.eq('ringing_group_id', groupId)
					.single()
					.then(catchSupabaseErrors)) as { id: number } | null;
				if (!raced?.id) {
					throw new Error(`Failed to create ring sequence: ${error.message}`);
				}
				sequenceId = raced.id;
			} else {
				throw new Error(`Failed to create ring sequence: ${error.message}`);
			}
		} else {
			sequenceId = inserted!.id;
		}
	}

	// Link every bird sharing this prefix that isn't tracked by a sequence yet.
	// Multi-tenancy via RLS is only partially implemented (see issue #149), so
	// this doesn't rely on RLS alone — it also filters explicitly on
	// `ringing_group_ids` (a bird can be shared across groups, so `groupId`
	// must appear in the array, not just match a single owner column),
	// matching the pattern in `app/actions/sp-data.ts`.
	const birds = await supabase
		.from('Birds')
		.select('id')
		.ilike('ring_no', `${prefix}%`)
		.contains('ringing_group_ids', [groupId])
		.then(catchSupabaseErrors);

	const allreadyInSequenceBirds = await supabase
		.from('RingSequences_Birds')
		.select('bird_id')
		.in('bird_id', birds?.map(({ id }) => id) ?? [])
		.then(catchSupabaseErrors);

	const birdsToLink = (birds ?? []).filter(
		(bird) => !allreadyInSequenceBirds?.some((s) => s.bird_id === bird.id)
	);

	await supabase
		.from('RingSequences_Birds')
		.insert(
			birdsToLink?.map(({ id }) => ({
				ringing_group_id: groupId,
				ring_sequence_id: sequenceId,
				bird_id: id
			})) ?? []
		)
		.then(catchSupabaseErrors);

	return sequenceId;
}

// Promotes a control ring to a tracked ring sequence: derives the ring's
// 3-character prefix and finds-or-creates the RingSequences row for it,
// linking every control sharing that prefix. The updated RPC (issue #661)
// then drops them all from `/controls` on the next load. Reads `ring_no` /
// `viewed_group_id` from the submitted form, matching `updateRingSequence`'s
// `useActionState` shape.
export async function promoteControlToSequence(
	_prevState: PromoteControlState,
	formData: FormData
): Promise<PromoteControlState> {
	const ringNo = (formData.get('ring_no') as string)?.trim();
	const viewedGroupId = Number(formData.get('viewed_group_id'));

	if (!ringNo) {
		return { success: false, error: 'Missing ring number' };
	}
	if (!viewedGroupId) {
		return { success: false, error: 'Missing group' };
	}

	const prefix = ringNo.slice(0, 3);

	try {
		const supabase = await getAuthenticatedSupabaseClient();
		await findOrCreateRingSequenceAndLinkBirds(supabase, prefix, viewedGroupId);

		return { success: true };
	} catch (error) {
		return { success: false, error: (error as Error).message };
	}
}

// Result shape for `createSequenceFromImportPrefix`, mirroring the discriminated
// unions above so the modal reacts without an exception crossing the boundary.
export type CreateSequenceFromPrefixState =
	| { success: true }
	| { success: false; error: string }
	| null;

// Creates a group-owned ring sequence for an unassigned import prefix (issue
// #697) and links every currently-untracked bird sharing it. Unlike
// `promoteControlToSequence`, the sequence is `owned_by_group = true` (these are
// the group's own newly-ringed birds, not a foreign control) and carries the
// `first_ring`/`last_ring` bounds the ring-sequences UI suggested (and the user
// may have adjusted). `fetchUnassignedImportPrefixes` drops the prefix on the
// next load once its birds are linked. Reads `prefix` / `first_ring` /
// `last_ring` / `viewed_group_id` from the submitted form, matching the
// `useActionState` shape of the other write actions.
export async function createSequenceFromImportPrefix(
	_prevState: CreateSequenceFromPrefixState,
	formData: FormData
): Promise<CreateSequenceFromPrefixState> {
	const prefix = (formData.get('prefix') as string)?.trim();
	const firstRing = (formData.get('first_ring') as string)?.trim() || null;
	const lastRing = (formData.get('last_ring') as string)?.trim() || null;
	const viewedGroupId = Number(formData.get('viewed_group_id'));

	if (!prefix) {
		return { success: false, error: 'Missing prefix' };
	}
	if (!viewedGroupId) {
		return { success: false, error: 'Missing group' };
	}

	try {
		const supabase = await getAuthenticatedSupabaseClient();
		await findOrCreateRingSequenceAndLinkBirds(
			supabase,
			prefix,
			viewedGroupId,
			{
				ownedByGroup: true,
				firstRing,
				lastRing
			}
		);

		return { success: true };
	} catch (error) {
		return { success: false, error: (error as Error).message };
	}
}
