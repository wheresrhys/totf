import { notFound } from 'next/navigation';
import { resolveGroupIdBySlug } from '@/lib/group-slug';
import MistakesPage from '@/app/(routes)/mistakes/page';

export default async function CrossGroupMistakesPage({
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
	return <MistakesPage viewedGroup={viewedGroup} />;
}
