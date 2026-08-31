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
