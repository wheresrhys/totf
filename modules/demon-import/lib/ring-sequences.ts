import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase.types';

type RingSequencesBirdsInsert =
	Database['public']['Tables']['RingSequences_Birds']['Insert'];

// Looks up the existing `RingSequences` row a ring number belongs to and returns
// its id, or `null` if the group has no sequence covering it. A sequence matches
// when two criteria hold:
//   1. its `prefix` equals the first three characters of the ring number (a ring
//      prefix is always exactly three letters), and
//   2. the ring's numeric part (the trailing digits, after stripping the leading
//      alpha prefix) falls within the sequence's numeric window,
//      `first_index <= ring number <= last_index` — powered by the
//      `first_index`/`last_index` generated columns on RingSequences.
// `(prefix, ringing_group_id)` is unique, so at most one row can match. The import
// deliberately never *creates* a sequence here (that was removed in #695 — it
// slowed imports catastrophically): sequences are authored in the ring-sequences
// UI, and a ring with no matching sequence is simply left unassigned.
export function createRingSequenceLookup(supabaseClient: SupabaseClient) {
	return async (
		ringNo: string,
		ringingGroupId: number
	): Promise<number | null> => {
		const prefix = ringNo.slice(0, 3);
		if (prefix.length === 0) return null;

		// The ring's numeric part: trailing digits after the leading alpha prefix.
		// Must match the `first_index`/`last_index` generated-column parse
		// (`substring(... FROM '[0-9]+$')`). A ring with no trailing digits can't be
		// range-checked, so it matches no sequence.
		const numericPart = ringNo.match(/[0-9]+$/);
		if (!numericPart) return null;
		const ringNumber = Number(numericPart[0]);

		const { data, error } = await supabaseClient
			.from('RingSequences')
			.select('id')
			.eq('ringing_group_id', ringingGroupId)
			.eq('prefix', prefix)
			.lte('first_index', ringNumber)
			.gte('last_index', ringNumber);
		if (error) throw error;
		if (!data || data.length === 0) return null;
		return data[0].id;
	};
}

// Records that `ringingGroupId` links `birdId` to `ringSequenceId`, via the
// `RingSequences_Birds` join table (issue #703). Tracking is per-group rather than
// a single group-agnostic FK on `Birds`: each group's link is its own row, so one
// group's import can never consume another group's tracking slot for a shared
// bird. Upserts on the table's `(bird_id, ring_sequence_id, ringing_group_id)`
// unique constraint and ignores a duplicate (re-importing the same 'N' row is a
// no-op here, not an error).
export function createRingSequenceLinker(supabaseClient: SupabaseClient) {
	return async (
		birdId: number,
		ringSequenceId: number,
		ringingGroupId: number
	): Promise<void> => {
		const { error } = await supabaseClient
			.from('RingSequences_Birds')
			.upsert<RingSequencesBirdsInsert>(
				{
					bird_id: birdId,
					ring_sequence_id: ringSequenceId,
					ringing_group_id: ringingGroupId
				},
				{
					onConflict: 'bird_id,ring_sequence_id,ringing_group_id',
					ignoreDuplicates: true
				}
			);
		if (error) throw error;
	};
}
