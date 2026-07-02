import SpeciesPage from '@/app/(routes)/species/[speciesName]/page';

export default async function CrossGroupSingleSpeciesPage(props: {
	params: Promise<{ id: string; speciesName: string }>;
}) {
	const { id, speciesName } = await props.params;
	return (
		<SpeciesPage
			params={Promise.resolve({ speciesName })}
			viewedGroupId={Number(id)}
		/>
	);
}
