import PayOffPage from '@/app/(routes)/effort/page';

export default async function CrossGroupEffortPage({
	params
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <PayOffPage viewedGroupId={Number(id)} />;
}
