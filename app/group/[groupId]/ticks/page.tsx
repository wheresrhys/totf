import TicksPage from '@/app/(routes)/ticks/page';

export default async function CrossGroupTicksPage({
	params
}: {
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	return <TicksPage viewedGroupId={Number(groupId)} />;
}
