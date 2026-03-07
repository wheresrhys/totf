import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { createSupabaseClientWithJwt } from '@/lib/supabase';

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

export async function getGroupId(): Promise<number | null> {
	const cookieStore = await cookies();
	const value = cookieStore.get(COOKIE_NAME)?.value;
	if (!value) return null;
	const parsed = parseInt(value, 10);
	return isNaN(parsed) ? null : parsed;
}

export async function getAuthenticatedSupabaseClient() {
	const groupId = await getGroupId();
	if (groupId === null) {
		throw new Error('No group selected');
	}
	const jwt = await generateGroupJwt(groupId);
	return createSupabaseClientWithJwt(jwt);
}
