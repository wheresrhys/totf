import { notFound } from 'next/navigation';
import SpeciesPage from '@/app/(routes)/species/[speciesName]/page';
import { resolveGroupIdBySlug } from '@/lib/group-slug';

export default async function CrossGroupSingleSpeciesPage(props: {
	params: Promise<{ groupSlug: string; speciesName: string }>;
}) {
	const { groupSlug, speciesName } = await props.params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) notFound();
	return (
		<SpeciesPage
			params={Promise.resolve({ speciesName })}
			viewedGroupId={viewedGroupId}
		/>
	);
}
