import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createRingSequenceLinker,
	createRingSequenceLookup
} from '../ring-sequences';

describe('createRingSequenceLookup', () => {
	let mockGte: ReturnType<typeof vi.fn>;
	let mockLte: ReturnType<typeof vi.fn>;
	let mockEqPrefix: ReturnType<typeof vi.fn>;
	let mockEqGroup: ReturnType<typeof vi.fn>;
	let mockSelect: ReturnType<typeof vi.fn>;
	let mockFrom: ReturnType<typeof vi.fn>;
	let lookup: ReturnType<typeof createRingSequenceLookup>;

	beforeEach(() => {
		// Chain: from -> select -> eq(group) -> eq(prefix) -> lte(first_index) ->
		// gte(last_index) -> resolves to { data, error }.
		mockGte = vi.fn();
		mockLte = vi.fn(() => ({ gte: mockGte }));
		mockEqPrefix = vi.fn(() => ({ lte: mockLte }));
		mockEqGroup = vi.fn(() => ({ eq: mockEqPrefix }));
		mockSelect = vi.fn(() => ({ eq: mockEqGroup }));
		mockFrom = vi.fn(() => ({ select: mockSelect }));
		// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain this test needs, not the full SupabaseClient interface
		const mockClient = { from: mockFrom } as unknown as SupabaseClient;
		lookup = createRingSequenceLookup(mockClient);
	});

	it('queries RingSequences filtering by group, the first-3-char prefix, and numeric bounds', async () => {
		mockGte.mockResolvedValue({ data: [{ id: 5 }], error: null });
		await lookup('AEL1699', 7);
		expect(mockFrom).toHaveBeenCalledWith('RingSequences');
		expect(mockSelect).toHaveBeenCalledWith('id');
		expect(mockEqGroup).toHaveBeenCalledWith('ringing_group_id', 7);
		expect(mockEqPrefix).toHaveBeenCalledWith('prefix', 'AEL');
		expect(mockLte).toHaveBeenCalledWith('first_index', 1699);
		expect(mockGte).toHaveBeenCalledWith('last_index', 1699);
	});

	it('takes exactly the first three characters as the prefix comparator', async () => {
		mockGte.mockResolvedValue({ data: [{ id: 5 }], error: null });
		await lookup('ABC123456', 7);
		expect(mockEqPrefix).toHaveBeenCalledWith('prefix', 'ABC');
	});

	it('returns the id of the single matching sequence', async () => {
		mockGte.mockResolvedValue({ data: [{ id: 5 }], error: null });
		expect(await lookup('AEL1699', 7)).toBe(5);
	});

	it('returns null when no sequence matches the prefix and bounds (import leaves the ring unassigned)', async () => {
		mockGte.mockResolvedValue({ data: [], error: null });
		expect(await lookup('AEL1699', 7)).toBeNull();
	});

	it('returns null for an empty ring number without querying', async () => {
		expect(await lookup('', 7)).toBeNull();
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('returns null for a ring number with no trailing digits without querying', async () => {
		expect(await lookup('ABCDEF', 7)).toBeNull();
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('throws when the select returns an error', async () => {
		mockGte.mockResolvedValue({
			data: null,
			error: { message: 'select failed' }
		});
		await expect(lookup('AEL1699', 7)).rejects.toMatchObject({
			message: 'select failed'
		});
	});
});

describe('createRingSequenceLinker', () => {
	let mockUpsert: ReturnType<typeof vi.fn>;
	let mockFrom: ReturnType<typeof vi.fn>;
	let link: ReturnType<typeof createRingSequenceLinker>;

	beforeEach(() => {
		mockUpsert = vi.fn().mockResolvedValue({ error: null });
		mockFrom = vi.fn(() => ({ upsert: mockUpsert }));
		// eslint-disable-next-line no-restricted-syntax -- mock only implements the `from` chain this test needs, not the full SupabaseClient interface
		const mockClient = { from: mockFrom } as unknown as SupabaseClient;
		link = createRingSequenceLinker(mockClient);
	});

	it('upserts a RingSequences_Birds row for the bird, sequence and group, ignoring a duplicate on the (bird_id, ring_sequence_id, ringing_group_id) unique constraint', async () => {
		await link(11, 22, 33);
		expect(mockFrom).toHaveBeenCalledWith('RingSequences_Birds');
		expect(mockUpsert).toHaveBeenCalledWith(
			{ bird_id: 11, ring_sequence_id: 22, ringing_group_id: 33 },
			{
				onConflict: 'bird_id,ring_sequence_id,ringing_group_id',
				ignoreDuplicates: true
			}
		);
	});

	it('throws when the upsert returns an error', async () => {
		mockUpsert.mockResolvedValue({ error: { message: 'upsert failed' } });
		await expect(link(11, 22, 33)).rejects.toMatchObject({
			message: 'upsert failed'
		});
	});
});
