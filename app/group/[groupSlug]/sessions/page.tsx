import { notFound } from 'next/navigation';
import SessionsPage from '@/app/(routes)/sessions/page';
import { resolveGroupIdBySlug } from '@/lib/group-slug';

export default async function CrossGroupSessionsPage({
	params
}: {
	params: Promise<{ groupSlug: string }>;
}) {
	const { groupSlug } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) notFound();
	return <SessionsPage viewedGroupId={viewedGroupId} />;
}
