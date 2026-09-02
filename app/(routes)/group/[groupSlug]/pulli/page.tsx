import { notFound } from 'next/navigation';
import { resolveGroupIdBySlug } from '@/lib/group-slug';
import PulliPage from '@/app/(routes)/pulli/page';

export default async function GroupPulliPage({
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
	return <PulliPage viewedGroup={viewedGroup} />;
}
