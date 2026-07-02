import NotableRetrapsPage from '@/app/(routes)/retraps/page';

export default async function CrossGroupRetrapsPage({
	params
}: {
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	return <NotableRetrapsPage viewedGroupId={Number(groupId)} />;
}
