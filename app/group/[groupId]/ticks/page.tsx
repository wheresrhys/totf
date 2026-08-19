import { resolveGroupSlugById } from '@/lib/group-slug';
import TicksPage from '@/app/(routes)/ticks/page';

export default async function CrossGroupTicksPage({
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
	return <TicksPage viewedGroupId={viewedGroupId} viewedGroup={viewedGroup} />;
}
