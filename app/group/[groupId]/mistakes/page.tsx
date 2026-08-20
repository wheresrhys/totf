import { resolveGroupSlugById } from '@/lib/group-slug';
import MistakesPage from '@/app/(routes)/mistakes/page';

export default async function CrossGroupMistakesPage({
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
	return <MistakesPage viewedGroup={viewedGroup} />;
}
