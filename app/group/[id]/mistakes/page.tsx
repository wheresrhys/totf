import MistakesPage from '@/app/(routes)/mistakes/page';

export default async function CrossGroupMistakesPage({
	params
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <MistakesPage viewedGroupId={Number(id)} />;
}
