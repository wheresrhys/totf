import { notFound } from 'next/navigation';
import NotableRetrapsPage from '@/app/(routes)/retraps/page';
import { resolveGroupIdBySlug } from '@/lib/group-slug';

export default async function CrossGroupRetrapsPage({
	params
}: {
	params: Promise<{ groupSlug: string }>;
}) {
	const { groupSlug } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) notFound();
	return <NotableRetrapsPage viewedGroupId={viewedGroupId} />;
}
