import { redirect } from 'next/navigation';
import { getGroupCookie } from '@/app/actions/group-cookie';
import { resolveGroupSlugById } from '@/lib/group-slug';
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
	const viewedGroup = {
		id: viewedGroupId,
		slug: await resolveGroupSlugById(viewedGroupId)
	};
	return <Home viewedGroupId={viewedGroupId} viewedGroup={viewedGroup} />;
}
