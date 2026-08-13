import PulliPage from '@/app/(routes)/pulli/page';

export default async function CrossGroupPulliPage({
	params
}: {
	params: Promise<{ groupId: string }>;
}) {
	const { groupId } = await params;
	return <PulliPage viewedGroupId={Number(groupId)} />;
}
