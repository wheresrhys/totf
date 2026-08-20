import { resolveGroupSlugById } from '@/lib/group-slug';
import SpeciesPage from '@/app/(routes)/species/[speciesName]/page';

export default async function CrossGroupSingleSpeciesPage(props: {
	params: Promise<{ groupId: string; speciesName: string }>;
}) {
	const { groupId, speciesName } = await props.params;
	const viewedGroupId = Number(groupId);
	const viewedGroup = {
		id: viewedGroupId,
		slug: await resolveGroupSlugById(viewedGroupId)
	};
	return (
		<SpeciesPage
			params={Promise.resolve({ speciesName })}
			viewedGroup={viewedGroup}
		/>
	);
}
