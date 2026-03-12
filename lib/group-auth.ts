import { SignJWT } from 'jose';
import { createSupabaseClientWithJwt } from './supabase';
import { getGroupCookie } from '../app/actions/group-cookie';
import { LRUCache } from 'lru-cache';
import { SupabaseClient } from '@supabase/supabase-js';

const authenticatedClientCache = new LRUCache<number, SupabaseClient>({
	max: 100,
	ttl: 1000 * 60 * 5 // 5 minutes
});
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

export async function getAuthenticatedSupabaseClientForGroup(
	groupId: number
): Promise<SupabaseClient> {
	let client = authenticatedClientCache.get(groupId);
	if (!client) {
		const jwt = await generateGroupJwt(groupId);
		client = createSupabaseClientWithJwt(jwt);
		authenticatedClientCache.set(groupId, client);
	}
	return client;
}

export async function getAuthenticatedSupabaseClient() {
	const groupId = await getGroupCookie();
	if (groupId === null) {
		throw new Error('No group selected');
	}
	return getAuthenticatedSupabaseClientForGroup(groupId);
}
