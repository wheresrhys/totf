import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRingSequences, updateRingSequence } from '../ring-sequences';

const {
	mockEq,
	mockUpdate,
	mockFrom,
	mockGetClient,
	mockSelect,
	mockSelectEq,
	mockOrder
} = vi.hoisted(() => {
	const mockEq = vi.fn();
	const mockUpdate = vi.fn(() => ({ eq: mockEq }));
	// Read path: from(...).select(...).eq(...).order(...) => thenable result.
	const mockOrder = vi.fn();
	const mockSelectEq = vi.fn(() => ({ order: mockOrder }));
	const mockSelect = vi.fn(() => ({ eq: mockSelectEq }));
	const mockFrom = vi.fn(() => ({ update: mockUpdate, select: mockSelect }));
	const mockGetClient = vi.fn(async () => ({ from: mockFrom }));
	return {
		mockEq,
		mockUpdate,
		mockFrom,
		mockGetClient,
		mockSelect,
		mockSelectEq,
		mockOrder
	};
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

describe('fetchRingSequences', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('filters explicitly on the viewed group id and orders by prefix', async () => {
		const rows = [{ id: 1, prefix: 'ARW' }];
		mockOrder.mockResolvedValue({ data: rows, error: null });

		const result = await fetchRingSequences(42);

		expect(mockFrom).toHaveBeenCalledWith('RingSequences');
		expect(mockSelect).toHaveBeenCalledWith('*');
		expect(mockSelectEq).toHaveBeenCalledWith('ringing_group_id', 42);
		expect(mockOrder).toHaveBeenCalledWith('prefix');
		expect(result).toEqual(rows);
	});
});

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
