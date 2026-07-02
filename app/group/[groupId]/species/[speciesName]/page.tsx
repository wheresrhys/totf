import SpeciesPage from '@/app/(routes)/species/[speciesName]/page';

export default async function CrossGroupSingleSpeciesPage(props: {
	params: Promise<{ groupId: string; speciesName: string }>;
}) {
	const { groupId, speciesName } = await props.params;
	return (
		<SpeciesPage
			params={Promise.resolve({ speciesName })}
			viewedGroupId={Number(groupId)}
		/>
	);
}
