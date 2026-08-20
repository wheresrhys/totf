import { resolveGroupSlugById } from '@/lib/group-slug';
import ResightingsPage from '@/app/(routes)/resightings/page';

export default async function CrossGroupResightingsPage({
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
	return <ResightingsPage viewedGroup={viewedGroup} />;
}
