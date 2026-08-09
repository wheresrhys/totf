import ResightingsPage from '@/app/(routes)/resightings/page';

export default async function CrossGroupResightingsPage({
	params
}: {
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	return <ResightingsPage viewedGroupId={Number(groupId)} />;
}
