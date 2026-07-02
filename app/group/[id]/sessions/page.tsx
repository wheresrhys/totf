import SessionsPage from '@/app/(routes)/sessions/page';

export default async function CrossGroupSessionsPage({
	params
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <SessionsPage viewedGroupId={Number(id)} />;
}
