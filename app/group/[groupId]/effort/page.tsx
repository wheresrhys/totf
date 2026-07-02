import PayOffPage from '@/app/(routes)/effort/page';

export default async function CrossGroupEffortPage({
	params
}: {
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	return <PayOffPage viewedGroupId={Number(groupId)} />;
}
