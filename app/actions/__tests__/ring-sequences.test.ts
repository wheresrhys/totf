import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateRingSequence } from '../ring-sequences';

const { mockEq, mockUpdate, mockFrom, mockGetClient } = vi.hoisted(() => {
	const mockEq = vi.fn();
	const mockUpdate = vi.fn(() => ({ eq: mockEq }));
	const mockFrom = vi.fn(() => ({ update: mockUpdate }));
	const mockGetClient = vi.fn(async () => ({ from: mockFrom }));
	return { mockEq, mockUpdate, mockFrom, mockGetClient };
});

vi.mock('@/lib/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetClient
}));

// Mock lib/supabase so importing it doesn't build a real client (which throws
// on the empty test-env URL), while keeping catchSupabaseErrors' real
// throw-on-error behaviour that the action relies on.
vi.mock('@/lib/supabase', () => ({
	supabase: {},
	catchSupabaseErrors: <T>({
		data,
		error
	}: {
		data: T;
		error: { message: string } | null;
	}) => {
		if (error) throw new Error(`Failed to fetch data: ${error.message}`);
		return data ?? null;
	}
}));

function makeFormData(fields: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(fields)) fd.append(key, value);
	return fd;
}

describe('updateRingSequence', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('updates size and prefix and returns success on valid input', async () => {
		mockEq.mockResolvedValue({ data: null, error: null });

		const result = await updateRingSequence(
			null,
			makeFormData({ id: '7', size: 'C', prefix: 'ARW' })
		);

		expect(mockFrom).toHaveBeenCalledWith('RingSequences');
		expect(mockUpdate).toHaveBeenCalledWith({ size: 'C', prefix: 'ARW' });
		expect(mockEq).toHaveBeenCalledWith('id', 7);
		expect(result).toEqual({ success: true });
	});

	it('returns a validation error and does not touch supabase when size is empty', async () => {
		const result = await updateRingSequence(
			null,
			makeFormData({ id: '7', size: '', prefix: 'ARW' })
		);

		expect(mockGetClient).not.toHaveBeenCalled();
		expect(result).toEqual({
			success: false,
			error: 'Please select a ring size'
		});
	});

	it('returns a validation error when prefix is blank', async () => {
		const result = await updateRingSequence(
			null,
			makeFormData({ id: '7', size: 'C', prefix: '   ' })
		);

		expect(mockGetClient).not.toHaveBeenCalled();
		expect(result).toMatchObject({ success: false });
	});

	it('surfaces a unique-constraint violation message from the caught error', async () => {
		mockEq.mockResolvedValue({
			data: null,
			error: {
				message:
					'duplicate key value violates unique constraint "ring_sequences_ringing_group_id_prefix_key"'
			}
		});

		const result = await updateRingSequence(
			null,
			makeFormData({ id: '7', size: 'C', prefix: 'ARW' })
		);

		expect(result).toMatchObject({ success: false });
		if (result && !result.success) {
			expect(result.error).toContain('unique constraint');
		}
	});
});
