import { notFound, redirect } from 'next/navigation';
import { getGroupCookie } from '@/app/actions/group-cookie';
import { resolveGroupIdBySlug } from '@/lib/group-slug';
import HomePage from '@/app/(routes)/page';

export default async function GroupHomePage({
	params
}: {
	params: Promise<{ groupSlug: string }>;
}) {
	const { groupSlug } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) {
		notFound();
	}
	const loggedInGroupId = await getGroupCookie();
	if (viewedGroupId === loggedInGroupId) {
		redirect('/');
	}
	const viewedGroup = { id: viewedGroupId, slug: groupSlug };
	return <HomePage viewedGroup={viewedGroup} />;
}
