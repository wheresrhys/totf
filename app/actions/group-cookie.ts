'use server';

import { cookies } from 'next/headers';

const COOKIE_NAME = 'selected_group_id';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setGroupCookie(groupId: number): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.set(COOKIE_NAME, String(groupId), {
		maxAge: ONE_YEAR_SECONDS,
		httpOnly: true,
		sameSite: 'strict',
		path: '/'
	});
}

export async function getGroupCookie(): Promise<number | null> {
	const cookieStore = await cookies();
	const groupId = cookieStore.get(COOKIE_NAME)?.value;
	return groupId ? parseInt(groupId, 10) : null;
}
