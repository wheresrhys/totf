import NotableRetrapsPage from '@/app/(routes)/retraps/page';

export default async function CrossGroupRetrapsPage({
	params
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <NotableRetrapsPage viewedGroupId={Number(id)} />;
}
