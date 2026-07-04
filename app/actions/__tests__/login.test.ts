import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loginGroup } from '../login';
import { setGroupCookie } from '../group-cookie';

const { mockSingle, mockFrom } = vi.hoisted(() => {
	const mockSingle = vi.fn();
	const mockEq = vi.fn(() => ({ single: mockSingle }));
	const mockSelect = vi.fn(() => ({ eq: mockEq }));
	const mockFrom = vi.fn(() => ({ select: mockSelect }));
	return { mockSingle, mockFrom };
});

vi.mock('@/lib/supabase', () => ({
	supabase: { from: mockFrom }
}));

vi.mock('bcryptjs', () => ({
	default: { compare: vi.fn() }
}));

function makeFormData(groupId: number, password: string): FormData {
	const fd = new FormData();
	fd.append('groupId', String(groupId));
	fd.append('password', password);
	return fd;
}

describe('loginGroup', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('sets cookie and returns success when password is correct', async () => {
		const group = {
			id: 3,
			group_name: 'Alpha',
			password_hash: '$2a$hash',
			password_salt: 'salt123'
		};
		mockSingle.mockResolvedValue({ data: group, error: null });

		const bcrypt = (await import('bcryptjs')).default;
		vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

		const result = await loginGroup(null, makeFormData(3, 'correct-password'));

		expect(vi.mocked(setGroupCookie)).toHaveBeenCalledWith(3);
		expect(result).toEqual({ success: true });
	});

	it('returns error and does not set cookie when password is wrong', async () => {
		const group = {
			id: 3,
			group_name: 'Alpha',
			password_hash: '$2a$hash',
			password_salt: 'salt123'
		};
		mockSingle.mockResolvedValue({ data: group, error: null });

		const bcrypt = (await import('bcryptjs')).default;
		vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

		const result = await loginGroup(null, makeFormData(3, 'wrong-password'));

		expect(vi.mocked(setGroupCookie)).not.toHaveBeenCalled();
		expect(result).toEqual({
			success: false,
			error: 'Wrong password for Alpha'
		});
	});

	it('returns error when group has no password hash', async () => {
		mockSingle.mockResolvedValue({
			data: {
				id: 9,
				group_name: 'Unknown',
				password_hash: null,
				password_salt: null
			},
			error: null
		});

		const result = await loginGroup(null, makeFormData(9, 'any'));

		expect(vi.mocked(setGroupCookie)).not.toHaveBeenCalled();
		expect(result).toMatchObject({ success: false });
	});

	it('returns error when supabase returns null data (unknown group)', async () => {
		mockSingle.mockResolvedValue({ data: null, error: null });

		const result = await loginGroup(null, makeFormData(999, 'any'));

		expect(vi.mocked(setGroupCookie)).not.toHaveBeenCalled();
		expect(result).toMatchObject({ success: false });
	});

	it('handles supabase SQL error gracefully without crashing', async () => {
		mockSingle.mockResolvedValue({
			data: null,
			error: { message: 'connection refused' }
		});

		const result = await loginGroup(null, makeFormData(1, 'any'));

		expect(vi.mocked(setGroupCookie)).not.toHaveBeenCalled();
		expect(result).toMatchObject({ success: false });
	});
});
