import { notFound } from 'next/navigation';
import PayOffPage from '@/app/(routes)/effort/page';
import { resolveGroupIdBySlug } from '@/lib/group-slug';

export default async function CrossGroupEffortPage({
	params
}: {
	params: Promise<{ groupSlug: string }>;
}) {
	const { groupSlug } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) notFound();
	return <PayOffPage viewedGroupId={viewedGroupId} />;
}
