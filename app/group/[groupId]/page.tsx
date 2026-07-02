import Home from '@/app/(routes)/page';

export default async function CrossGroupHome({
	params
}: {
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	return <Home viewedGroupId={Number(groupId)} />;
}
