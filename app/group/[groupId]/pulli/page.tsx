import { resolveGroupSlugById } from '@/lib/group-slug';
import PulliPage from '@/app/(routes)/pulli/page';

export default async function CrossGroupPulliPage({
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
	return <PulliPage viewedGroup={viewedGroup} />;
}
