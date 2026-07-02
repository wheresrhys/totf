import SessionsPage from '@/app/(routes)/sessions/page';

export default async function CrossGroupSessionsPage({
	params
}: {
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	return <SessionsPage viewedGroupId={Number(groupId)} />;
}
