import Home from '@/app/(routes)/page';

export default async function CrossGroupHome({
	params
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <Home viewedGroupId={Number(id)} />;
}
