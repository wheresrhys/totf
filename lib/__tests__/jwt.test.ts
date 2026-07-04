import { describe, it, expect, beforeAll } from 'vitest';
import { jwtVerify } from 'jose';
import { generateGroupJwt, verifyGroupJwt } from '../jwt';

const TEST_SECRET = 'test-secret-for-jwt-unit-tests';

beforeAll(() => {
	process.env.SUPABASE_JWT_SECRET = TEST_SECRET;
});

describe('generateGroupJwt', () => {
	it('produces a JWT with the correct ringing_group_id in app_metadata', async () => {
		const groupId = 42;
		const token = await generateGroupJwt(groupId);

		const encodedSecret = new TextEncoder().encode(TEST_SECRET);
		const { payload } = await jwtVerify(token, encodedSecret);

		expect(
			(payload.app_metadata as { ringing_group_id?: number })?.ringing_group_id
		).toBe(groupId);
	});

	it('sets role to authenticated', async () => {
		const token = await generateGroupJwt(1);

		const encodedSecret = new TextEncoder().encode(TEST_SECRET);
		const { payload } = await jwtVerify(token, encodedSecret);

		expect(payload.role).toBe('authenticated');
	});
});

describe('verifyGroupJwt', () => {
	it('returns groupId from a valid token', async () => {
		const groupId = 7;
		const token = await generateGroupJwt(groupId);

		const result = await verifyGroupJwt(token);

		expect(result).toBe(groupId);
	});

	it('returns null for a tampered token', async () => {
		const token = await generateGroupJwt(1);
		const tampered = token.slice(0, -5) + 'XXXXX';

		const result = await verifyGroupJwt(tampered);

		expect(result).toBeNull();
	});

	it('returns null for a token signed with a different secret', async () => {
		const otherSecret = new TextEncoder().encode('different-secret');
		const { SignJWT } = await import('jose');
		const token = await new SignJWT({
			role: 'authenticated',
			app_metadata: { ringing_group_id: 1 }
		})
			.setProtectedHeader({ alg: 'HS256' })
			.setIssuedAt()
			.setExpirationTime('1y')
			.sign(otherSecret);

		const result = await verifyGroupJwt(token);

		expect(result).toBeNull();
	});

	it('returns null for a completely invalid string', async () => {
		const result = await verifyGroupJwt('not-a-jwt');
		expect(result).toBeNull();
	});
});
