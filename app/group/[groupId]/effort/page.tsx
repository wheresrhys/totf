import { resolveGroupSlugById } from '@/lib/group-slug';
import PayOffPage from '@/app/(routes)/effort/page';

export default async function CrossGroupEffortPage({
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
	return <PayOffPage viewedGroupId={viewedGroupId} viewedGroup={viewedGroup} />;
}
