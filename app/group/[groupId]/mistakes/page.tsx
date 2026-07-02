import MistakesPage from '@/app/(routes)/mistakes/page';

export default async function CrossGroupMistakesPage({
	params
}: {
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	return <MistakesPage viewedGroupId={Number(groupId)} />;
}
