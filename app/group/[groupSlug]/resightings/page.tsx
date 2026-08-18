import { notFound } from 'next/navigation';
import ResightingsPage from '@/app/(routes)/resightings/page';
import { resolveGroupIdBySlug } from '@/lib/group-slug';

export default async function CrossGroupResightingsPage({
	params
}: {
	params: Promise<{ groupSlug: string }>;
}) {
	const { groupSlug } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) notFound();
	return <ResightingsPage viewedGroupId={viewedGroupId} />;
}
