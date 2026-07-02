import { redirect } from 'next/navigation';
import { getGroupCookie } from '@/app/actions/group-cookie';
import Home from '@/app/(routes)/page';

export default async function CrossGroupHome({
	params
}: {
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	const viewedGroupId = Number(groupId);
	const loggedInGroupId = await getGroupCookie();
	if (viewedGroupId === loggedInGroupId) {
		redirect('/');
	}
	return <Home viewedGroupId={viewedGroupId} />;
}
