import { notFound } from 'next/navigation';
import { resolveGroupIdBySlug } from '@/lib/group-slug';
import SpeciesPage from '@/app/(routes)/species/[speciesName]/page';

export default async function CrossGroupSingleSpeciesPage(props: {
	params: Promise<{ groupSlug: string; speciesName: string }>;
}) {
	const { groupSlug, speciesName } = await props.params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) {
		notFound();
	}
	const viewedGroup = { id: viewedGroupId, slug: groupSlug };
	return (
		<SpeciesPage
			params={Promise.resolve({ speciesName })}
			viewedGroup={viewedGroup}
		/>
	);
}
