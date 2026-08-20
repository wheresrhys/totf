import { resolveGroupSlugById } from '@/lib/group-slug';
import AllSpeciesPage from '@/app/(routes)/species/page';

export default async function CrossGroupSpeciesPage({
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
	return <AllSpeciesPage viewedGroup={viewedGroup} />;
}
