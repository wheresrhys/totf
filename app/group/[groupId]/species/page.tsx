import AllSpeciesPage from '@/app/(routes)/species/page';

export default async function CrossGroupSpeciesPage({
	params
}: {
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	return <AllSpeciesPage viewedGroupId={Number(groupId)} />;
}
