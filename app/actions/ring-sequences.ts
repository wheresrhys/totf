'use server';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';

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
