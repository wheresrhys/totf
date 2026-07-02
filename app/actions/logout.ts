'use server';
import { redirect } from 'next/navigation';
import { deleteGroupCookie } from './group-cookie';

export async function logout(): Promise<void> {
	await deleteGroupCookie();
	redirect('/');
}
