'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { RingSequenceRow, RingSize } from '@/app/models/db';

export type RingSequenceSummary = {
	sequence_prefix: string;
	ring_length: number;
	ring_count: number;
	earliest_date: string;
	latest_date: string;
};

export type RingSequenceDetailRow = {
	ring_no: string;
	species_name: string;
	ringed_date: string;
};

export type RingSequenceControlRow = {
	ring_no: string;
	species_name: string;
	first_date: string;
};

export async function fetchRingSequenceSummaries(
	viewedGroupId: number
): Promise<RingSequenceSummary[] | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('ring_sequence_summaries', { ringing_group_filter: viewedGroupId })
		.then(catchSupabaseErrors) as Promise<RingSequenceSummary[] | null>;
}

export async function fetchRingSequenceDetail(
	sequencePrefix: string,
	ringLength: number,
	viewedGroupId: number
): Promise<RingSequenceDetailRow[] | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('ring_sequence_detail', {
			sequence_prefix_filter: sequencePrefix,
			ring_length_filter: ringLength,
			ringing_group_filter: viewedGroupId
		})
		.then(catchSupabaseErrors) as Promise<RingSequenceDetailRow[] | null>;
}

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

	const sequence = await supabase
		.from('RingSequences')
		.select('prefix, first_ring')
		.eq('id', ringSequenceId)
		.maybeSingle()
		.then(catchSupabaseErrors);

	if (!sequence?.first_ring) return [];

	const wildcardCount = sequence.first_ring.length - sequence.prefix.length;
	if (wildcardCount < 0) return [];
	const ringNoPattern = sequence.prefix + '_'.repeat(wildcardCount);

	type BirdQueryRow = {
		ring_no: string;
		species: { species_name: string } | null;
		encounters: { session: { visit_date: string } | null }[];
	};

	const birds = (await supabase
		.from('Birds')
		.select(
			`
			ring_no,
			species:Species(species_name),
			encounters:Encounters!inner(
				session:Sessions(visit_date)
			)
		`
		)
		.eq('encounters.record_type', 'N')
		.ilike('ring_no', ringNoPattern)
		.order('ring_no')
		.then(catchSupabaseErrors)) as BirdQueryRow[] | null;

	return (birds ?? []).map((bird) => ({
		ring_no: bird.ring_no,
		species_name: bird.species?.species_name ?? '',
		ringed_date: bird.encounters[0]?.session?.visit_date ?? ''
	}));
}

// Updates a ring sequence's `size` and `prefix`. RLS enforces the group
// boundary, so no manual `ringing_group_id` check is needed. Mirrors the
// `LoginState` result-shape convention: any thrown `catchSupabaseErrors` error
// (e.g. a unique-constraint violation on `prefix`) is surfaced via `.message`.
export async function updateRingSequence(
	_prevState: UpdateRingSequenceState,
	formData: FormData
): Promise<UpdateRingSequenceState> {
	const id = Number(formData.get('id'));
	const size = formData.get('size') as string;
	const prefix = (formData.get('prefix') as string)?.trim();

	if (!size) {
		return { success: false, error: 'Please select a ring size' };
	}
	if (!prefix) {
		return { success: false, error: 'Prefix cannot be empty' };
	}

	try {
		const supabase = await getAuthenticatedSupabaseClient();
		await supabase
			.from('RingSequences')
			.update({ size: size as RingSize, prefix })
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

// Returns the id of the group's RingSequences row for `prefix`, creating a
// promoted (`owned_by_group = false`, `size = NULL`) row if none exists yet.
// Reuses an existing row untouched — never overwriting its `owned_by_group` or
// `size`, which the importer or a prior manual edit may have set. RLS scopes
// every query to the caller's group; the explicit `ringing_group_id` filter is
// defence-in-depth.
async function findOrCreateRingSequence(
	supabase: PromoteSupabaseClient,
	prefix: string,
	groupId: number
): Promise<number> {
	const existing = (await supabase
		.from('RingSequences')
		.select('id')
		.eq('prefix', prefix)
		.eq('ringing_group_id', groupId)
		.maybeSingle()
		.then(catchSupabaseErrors)) as { id: number } | null;
	if (existing?.id) return existing.id;

	const { data: inserted, error } = await supabase
		.from('RingSequences')
		.insert({
			prefix,
			ringing_group_id: groupId,
			owned_by_group: false,
			size: null
		})
		.select('id')
		.single();

	if (error) {
		// A concurrent promote for the same prefix won the race and inserted the
		// row first — re-select and reuse it rather than surfacing a hard error.
		if (error.code === UNIQUE_VIOLATION) {
			const raced = (await supabase
				.from('RingSequences')
				.select('id')
				.eq('prefix', prefix)
				.eq('ringing_group_id', groupId)
				.single()
				.then(catchSupabaseErrors)) as { id: number } | null;
			if (raced?.id) return raced.id;
		}
		throw new Error(`Failed to create ring sequence: ${error.message}`);
	}

	return inserted!.id;
}

// Promotes a control ring to a tracked ring sequence: derives the ring's
// leading-alpha prefix, finds or creates an `owned_by_group = false`
// RingSequences row for it, and links the bird via `Birds.ring_sequence_id`
// (firing the bounds trigger). The updated RPC (issue #661) then drops the ring
// from `/controls` on the next load. Reads `ring_no` / `viewed_group_id` from
// the submitted form, matching `updateRingSequence`'s `useActionState` shape.
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

	const prefix = (ringNo.match(/^[A-Za-z]+/) || [''])[0];
	if (!prefix) {
		return {
			success: false,
			error: `Could not derive a prefix from ring "${ringNo}"`
		};
	}

	try {
		const supabase = await getAuthenticatedSupabaseClient();
		const sequenceId = await findOrCreateRingSequence(
			supabase,
			prefix,
			viewedGroupId
		);

		// Link the bird to the sequence. RLS scopes the update to birds visible to
		// the caller's group; the write fires the bounds trigger, which populates
		// first_ring/last_ring from this bird.
		await supabase
			.from('Birds')
			.update({ ring_sequence_id: sequenceId })
			.eq('ring_no', ringNo)
			.then(catchSupabaseErrors);

		return { success: true };
	} catch (error) {
		return { success: false, error: (error as Error).message };
	}
}
