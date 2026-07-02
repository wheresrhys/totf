'use server';

import { cookies } from 'next/headers';
import { generateGroupJwt, verifyGroupJwt } from '@/lib/jwt';

const COOKIE_NAME = 'TOTFSession';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setGroupCookie(groupId: number): Promise<void> {
	const jwt = await generateGroupJwt(groupId);
	const cookieStore = await cookies();
	cookieStore.set(COOKIE_NAME, jwt, {
		maxAge: ONE_YEAR_SECONDS,
		httpOnly: true,
		sameSite: 'strict',
		path: '/'
	});
}

export async function getGroupCookie(): Promise<number | null> {
	const cookieStore = await cookies();
	const token = cookieStore.get(COOKIE_NAME)?.value;
	return token ? verifyGroupJwt(token) : null;
}

export async function getGroupJwt(): Promise<string | null> {
	const cookieStore = await cookies();
	return cookieStore.get(COOKIE_NAME)?.value ?? null;
}
