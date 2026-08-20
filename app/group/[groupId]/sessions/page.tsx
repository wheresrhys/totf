import { resolveGroupSlugById } from '@/lib/group-slug';
import SessionsPage from '@/app/(routes)/sessions/page';

export default async function CrossGroupSessionsPage({
	params
}: {
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	const viewedGroupId = Number(groupId);
	const viewedGroup = {
		id: viewedGroupId,
		slug: await resolveGroupSlugById(viewedGroupId)
	};
	return <SessionsPage viewedGroup={viewedGroup} />;
}
