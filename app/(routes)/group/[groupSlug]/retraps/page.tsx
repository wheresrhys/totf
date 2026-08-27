import { notFound } from 'next/navigation';
import { resolveGroupIdBySlug } from '@/lib/group-slug';
import NotableRetrapsPage from '@/app/(routes)/retraps/page';

export default async function CrossGroupRetrapsPage({
	params
}: {
	params: Promise<{ groupSlug: string }>;
}) {
	const { groupSlug } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) {
		notFound();
	}
	const viewedGroup = { id: viewedGroupId, slug: groupSlug };
	return <NotableRetrapsPage viewedGroup={viewedGroup} />;
}
