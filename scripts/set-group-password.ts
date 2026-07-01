#!/usr/bin/env tsx
import bcrypt from 'bcryptjs';
import { supabase } from '../lib/supabase';
import { getAuthenticatedSupabaseClientForGroup } from '../lib/group-auth';

const [groupName, password] = process.argv.slice(2);

if (!groupName || !password) {
	console.error('Usage: set-group-password <groupName> <password>');
	process.exit(1);
}

const pepper = process.env.PASSWORD_PEPPER;
if (!pepper) {
	console.error('PASSWORD_PEPPER env var is required');
	process.exit(1);
}

const { data: group, error: fetchError } = await supabase
	.from('RingingGroups')
	.select('id, group_name')
	.eq('group_name', groupName)
	.single();

if (fetchError || !group) {
	console.error(`Group "${groupName}" not found`);
	process.exit(1);
}

const hash = await bcrypt.hash(password + pepper, 12);

const authedClient = await getAuthenticatedSupabaseClientForGroup(group.id);
const { error } = await authedClient
	.from('RingingGroups')
	.update({ password_hash: hash })
	.eq('id', group.id);

if (error) {
	console.error('Failed to set password:', error.message);
	process.exit(1);
}

console.log(`Password set for group "${group.group_name}"`);
