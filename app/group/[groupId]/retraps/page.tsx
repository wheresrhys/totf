import { resolveGroupSlugById } from '@/lib/group-slug';
import NotableRetrapsPage from '@/app/(routes)/retraps/page';

export default async function CrossGroupRetrapsPage({
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
	return <NotableRetrapsPage viewedGroup={viewedGroup} />;
}
