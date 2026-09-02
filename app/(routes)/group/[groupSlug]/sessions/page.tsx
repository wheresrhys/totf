import { notFound } from 'next/navigation';
import { resolveGroupIdBySlug } from '@/lib/group-slug';
import SessionsPage from '@/app/(routes)/sessions/page';

export default async function GroupSessionsPage({
	params
}: {
	params: Promise<{ groupSlug: string }>;
}) {
	const { groupSlug } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) {
		notFound();
	}
	const viewedGroup = { id: viewedGroupId, slug: groupSlug };
	return <SessionsPage viewedGroup={viewedGroup} />;
}
