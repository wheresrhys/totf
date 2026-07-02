'use server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';
import { setGroupCookie } from './group-cookie';

export type LoginState =
	| { success: true }
	| { success: false; error: string }
	| null;

export async function loginGroup(
	_prevState: LoginState,
	formData: FormData
): Promise<LoginState> {
	const groupId = Number(formData.get('groupId'));
	const password = formData.get('password') as string;

	const { data: group } = await supabase
		.from('RingingGroups')
		.select('id, group_name, password_hash, password_salt')
		.eq('id', groupId)
		.single();

	if (!group?.password_hash || !group?.password_salt) {
		return {
			success: false,
			error: `Wrong password for ${group?.group_name ?? 'this group'}`
		};
	}

	const isValid = await bcrypt.compare(
		password + group.password_salt,
		group.password_hash
	);
	if (!isValid) {
		return { success: false, error: `Wrong password for ${group.group_name}` };
	}

	await setGroupCookie(group.id);
	return { success: true };
}
