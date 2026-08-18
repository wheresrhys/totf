import { notFound } from 'next/navigation';
import PulliPage from '@/app/(routes)/pulli/page';
import { resolveGroupIdBySlug } from '@/lib/group-slug';

export default async function CrossGroupPulliPage({
	params
}: {
	params: Promise<{ groupSlug: string }>;
}) {
	const { groupSlug } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) notFound();
	return <PulliPage viewedGroupId={viewedGroupId} />;
}
