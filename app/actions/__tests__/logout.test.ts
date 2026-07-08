import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logout } from '../logout';
import { deleteGroupCookie } from '../group-cookie';
import { redirect } from 'next/navigation';

describe('logout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('calls deleteGroupCookie', async () => {
		await logout();
		expect(vi.mocked(deleteGroupCookie)).toHaveBeenCalledOnce();
	});

	it('redirects to /', async () => {
		await logout();
		expect(vi.mocked(redirect)).toHaveBeenCalledWith('/');
	});
});
