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
	const pepper = process.env.PASSWORD_PEPPER ?? '';

	const { data: group } = await supabase
		.from('RingingGroups')
		.select('id, group_name, password_hash')
		.eq('id', groupId)
		.single();

	if (!group?.password_hash) {
		return {
			success: false,
			error: `Wrong password for ${group?.group_name ?? 'this group'}`
		};
	}

	const isValid = await bcrypt.compare(password + pepper, group.password_hash);
	if (!isValid) {
		return { success: false, error: `Wrong password for ${group.group_name}` };
	}

	await setGroupCookie(group.id);
	return { success: true };
}
