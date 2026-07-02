import AllSpeciesPage from '@/app/(routes)/species/page';

export default async function CrossGroupSpeciesPage({
	params
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <AllSpeciesPage viewedGroupId={Number(id)} />;
}
