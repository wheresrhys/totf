import { notFound, redirect } from 'next/navigation';
import { getGroupCookie } from '@/app/actions/group-cookie';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';

export default async function CrossGroupLayout({
	children,
	params
}: {
	children: React.ReactNode;
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	const viewedGroupId = Number(groupId);
	const loggedInGroupId = await getGroupCookie();

	if (!loggedInGroupId) {
		redirect('/');
	}

	if (viewedGroupId === loggedInGroupId) {
		redirect('/');
	}

	const supabase = await getAuthenticatedSupabaseClient();
	const { data } = await supabase
		.from('GroupDataSharing')
		.select('id')
		.eq('from_group_id', viewedGroupId)
		.eq('to_group_id', loggedInGroupId)
		.maybeSingle();

	if (!data) {
		notFound();
	}

	return children;
}
