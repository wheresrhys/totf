import { notFound } from 'next/navigation';
import TicksPage from '@/app/(routes)/ticks/page';
import { resolveGroupIdBySlug } from '@/lib/group-slug';

export default async function CrossGroupTicksPage({
	params
}: {
	params: Promise<{ groupSlug: string }>;
}) {
	const { groupSlug } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) notFound();
	return <TicksPage viewedGroupId={viewedGroupId} />;
}
