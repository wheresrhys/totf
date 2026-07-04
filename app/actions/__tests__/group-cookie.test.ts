import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.unmock('@/app/actions/group-cookie');

const { mockCookieStore } = vi.hoisted(() => {
	const mockCookieStore = {
		set: vi.fn(),
		get: vi.fn(),
		delete: vi.fn()
	};
	return { mockCookieStore };
});

vi.mock('next/headers', () => ({
	cookies: vi.fn().mockResolvedValue(mockCookieStore)
}));

const TEST_SECRET = 'test-secret-for-cookie-unit-tests';

beforeAll(() => {
	process.env.SUPABASE_JWT_SECRET = TEST_SECRET;
});

describe('group-cookie', () => {
	let setGroupCookie: (id: number) => Promise<void>;
	let getGroupCookie: () => Promise<number | null>;
	let deleteGroupCookie: () => Promise<void>;

	beforeAll(async () => {
		const mod = await import('../group-cookie');
		setGroupCookie = mod.setGroupCookie;
		getGroupCookie = mod.getGroupCookie;
		deleteGroupCookie = mod.deleteGroupCookie;
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('setGroupCookie', () => {
		it('writes an httpOnly, sameSite lax cookie', async () => {
			await setGroupCookie(5);

			expect(mockCookieStore.set).toHaveBeenCalledOnce();
			const [, , options] = mockCookieStore.set.mock.calls[0];
			expect(options).toMatchObject({
				httpOnly: true,
				sameSite: 'lax'
			});
		});

		it('writes a JWT containing the groupId', async () => {
			await setGroupCookie(5);

			const [, token] = mockCookieStore.set.mock.calls[0];
			const { verifyGroupJwt } = await import('@/lib/jwt');
			const groupId = await verifyGroupJwt(token);
			expect(groupId).toBe(5);
		});
	});

	describe('getGroupCookie', () => {
		it('returns null when cookie is absent', async () => {
			mockCookieStore.get.mockReturnValue(undefined);

			const result = await getGroupCookie();

			expect(result).toBeNull();
		});

		it('round-trips: returns correct groupId from a valid cookie', async () => {
			const { generateGroupJwt } = await import('@/lib/jwt');
			const token = await generateGroupJwt(99);
			mockCookieStore.get.mockReturnValue({ value: token });

			const result = await getGroupCookie();

			expect(result).toBe(99);
		});

		it('returns null when cookie has an invalid signature', async () => {
			mockCookieStore.get.mockReturnValue({ value: 'invalid.jwt.token' });

			const result = await getGroupCookie();

			expect(result).toBeNull();
		});
	});

	describe('deleteGroupCookie', () => {
		it('deletes the TOTFSession cookie', async () => {
			await deleteGroupCookie();

			expect(mockCookieStore.delete).toHaveBeenCalledWith('TOTFSession');
		});
	});
});
