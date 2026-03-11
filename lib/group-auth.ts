import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { createSupabaseClientWithJwt } from '@/lib/supabase';
import { getGroupCookie } from '@/app/actions/group-cookie';

const COOKIE_NAME = 'selected_group_id';

export async function generateGroupJwt(groupId: number): Promise<string> {
	const secret = process.env.SUPABASE_JWT_SECRET;
	if (!secret) {
		throw new Error('SUPABASE_JWT_SECRET environment variable is not set');
	}
	const encodedSecret = new TextEncoder().encode(secret);
	return new SignJWT({
		role: 'authenticated',
		app_metadata: { ringing_group_id: groupId }
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('1d')
		.sign(encodedSecret);
}

export async function getAuthenticatedSupabaseClient() {
	const groupId = await getGroupCookie();
	if (groupId === null) {
		throw new Error('No group selected');
	}
	const jwt = await generateGroupJwt(groupId);
	return createSupabaseClientWithJwt(jwt);
}
