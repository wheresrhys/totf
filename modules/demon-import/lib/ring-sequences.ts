import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase.types';

type RingSequencesBirdsInsert =
	Database['public']['Tables']['RingSequences_Birds']['Insert'];

// Looks up the existing `RingSequences` row a ring number belongs to: its `prefix`
// must equal the ring's first three letters, and the ring's trailing numeric part
// must fall within the row's `first_index`/`last_index` window.
// `(prefix, ringing_group_id)` is unique, so at most one row can match.
export function createRingSequenceLookup(supabaseClient: SupabaseClient) {
	return async (
		ringNo: string,
		ringingGroupId: number
	): Promise<number | null> => {
		const prefix = ringNo.slice(0, 3);
		if (prefix.length === 0) return null;

		// Must match the first_index/last_index generated-column parse
		// (substring(... FROM '[0-9]+$')) — a ring with no trailing digits can't be
		// range-checked.
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

/** Records that `ringingGroupId` links `birdId` to `ringSequenceId` (see #703). */
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
