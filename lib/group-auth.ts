import { createSupabaseClientWithJwt } from './supabase';
import { generateGroupJwt } from './jwt';
import { getGroupJwt } from '../app/actions/group-cookie';
import { SupabaseClient } from '@supabase/supabase-js';

export async function getAuthenticatedSupabaseClientForGroup(
	groupId: number
): Promise<SupabaseClient> {
	const jwt = await generateGroupJwt(groupId);
	return createSupabaseClientWithJwt(jwt);
}

export async function getAuthenticatedSupabaseClient(): Promise<SupabaseClient> {
	const jwt = await getGroupJwt();
	if (!jwt) {
		throw new Error('No group selected');
	}
	return createSupabaseClientWithJwt(jwt);
}
