import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	fetchRingSequences,
	updateRingSequence,
	promoteControlToSequence
} from '../ring-sequences';

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

type QueryResult = {
	data: unknown;
	error: { code?: string; message: string } | null;
};

// A chainable + thenable query-builder mock resolving to `result` on await and
// on the terminal `maybeSingle()` / `single()` calls. Records every call so
// tests can assert on `insert` / `update` / `eq` payloads.
function makeBuilder(result: QueryResult) {
	const builder = {
		select: vi.fn(() => builder),
		insert: vi.fn(() => builder),
		update: vi.fn(() => builder),
		eq: vi.fn(() => builder),
		ilike: vi.fn(() => builder),
		is: vi.fn(() => builder),
		contains: vi.fn(() => builder),
		maybeSingle: vi.fn(() => Promise.resolve(result)),
		single: vi.fn(() => Promise.resolve(result)),
		then: (resolve: (value: QueryResult) => unknown) =>
			Promise.resolve(result).then(resolve)
	};
	return builder;
}

describe.skip('promoteControlToSequence', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('creates a promoted (owned_by_group=false, size=null) sequence and links the bird when no matching prefix exists', async () => {
		const find = makeBuilder({ data: null, error: null }); // no existing row
		const insert = makeBuilder({ data: { id: 99 }, error: null });
		const birds = makeBuilder({ data: null, error: null });
		const from = vi
			.fn()
			.mockReturnValueOnce(find)
			.mockReturnValueOnce(insert)
			.mockReturnValueOnce(birds);
		mockGetClient.mockResolvedValue({ from });

		const result = await promoteControlToSequence(
			null,
			makeFormData({ ring_no: 'ABC1234', viewed_group_id: '42' })
		);

		expect(insert.insert).toHaveBeenCalledWith({
			prefix: 'ABC',
			ringing_group_id: 42,
			owned_by_group: false,
			size: null
		});
		expect(birds.update).toHaveBeenCalledWith({ ring_sequence_id: 99 });
		expect(birds.ilike).toHaveBeenCalledWith('ring_no', 'ABC%');
		expect(birds.is).toHaveBeenCalledWith('ring_sequence_id', null);
		expect(birds.contains).toHaveBeenCalledWith('ringing_group_ids', [42]);
		expect(result).toEqual({ success: true });
	});

	it('reuses an existing matching-prefix sequence without inserting or modifying it', async () => {
		const find = makeBuilder({ data: { id: 55 }, error: null }); // existing row
		const birds = makeBuilder({ data: null, error: null });
		const from = vi.fn().mockReturnValueOnce(find).mockReturnValueOnce(birds);
		mockGetClient.mockResolvedValue({ from });

		const result = await promoteControlToSequence(
			null,
			makeFormData({ ring_no: 'ABC1234', viewed_group_id: '42' })
		);

		// No second RingSequences write: only the find + the Birds update ran, and
		// the Birds builder's `insert`/`update`-of-RingSequences is never touched.
		expect(from).toHaveBeenCalledTimes(2);
		expect(from).toHaveBeenNthCalledWith(1, 'RingSequences');
		expect(from).toHaveBeenNthCalledWith(2, 'Birds');
		expect(birds.insert).not.toHaveBeenCalled();
		expect(birds.update).toHaveBeenCalledWith({ ring_sequence_id: 55 });
		expect(birds.ilike).toHaveBeenCalledWith('ring_no', 'ABC%');
		expect(birds.is).toHaveBeenCalledWith('ring_sequence_id', null);
		expect(birds.contains).toHaveBeenCalledWith('ringing_group_ids', [42]);
		expect(result).toEqual({ success: true });
	});

	it('re-selects and reuses the row on a unique-violation race rather than erroring', async () => {
		const find = makeBuilder({ data: null, error: null });
		const insert = makeBuilder({
			data: null,
			error: { code: '23505', message: 'duplicate key value' }
		});
		const raced = makeBuilder({ data: { id: 77 }, error: null });
		const birds = makeBuilder({ data: null, error: null });
		const from = vi
			.fn()
			.mockReturnValueOnce(find)
			.mockReturnValueOnce(insert)
			.mockReturnValueOnce(raced)
			.mockReturnValueOnce(birds);
		mockGetClient.mockResolvedValue({ from });

		const result = await promoteControlToSequence(
			null,
			makeFormData({ ring_no: 'ABC1234', viewed_group_id: '42' })
		);

		expect(birds.update).toHaveBeenCalledWith({ ring_sequence_id: 77 });
		expect(result).toEqual({ success: true });
	});

	it('returns a validation error and does not touch supabase when ring_no is missing', async () => {
		const result = await promoteControlToSequence(
			null,
			makeFormData({ ring_no: '', viewed_group_id: '42' })
		);

		expect(mockGetClient).not.toHaveBeenCalled();
		expect(result).toMatchObject({ success: false });
	});

	it('surfaces a caught DB error from the bird-link update', async () => {
		const find = makeBuilder({ data: { id: 55 }, error: null });
		const birds = makeBuilder({
			data: null,
			error: { message: 'connection reset' }
		});
		const from = vi.fn().mockReturnValueOnce(find).mockReturnValueOnce(birds);
		mockGetClient.mockResolvedValue({ from });

		const result = await promoteControlToSequence(
			null,
			makeFormData({ ring_no: 'ABC1234', viewed_group_id: '42' })
		);

		expect(result).toMatchObject({ success: false });
		if (result && !result.success) {
			expect(result.error).toContain('connection reset');
		}
	});
});
