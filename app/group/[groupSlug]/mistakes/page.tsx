import { notFound } from 'next/navigation';
import MistakesPage from '@/app/(routes)/mistakes/page';
import { resolveGroupIdBySlug } from '@/lib/group-slug';

export default async function CrossGroupMistakesPage({
	params
}: {
	params: Promise<{ groupSlug: string }>;
}) {
	const { groupSlug } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) notFound();
	return <MistakesPage viewedGroupId={viewedGroupId} />;
}
