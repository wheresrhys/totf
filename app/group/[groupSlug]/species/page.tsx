import { notFound } from 'next/navigation';
import AllSpeciesPage from '@/app/(routes)/species/page';
import { resolveGroupIdBySlug } from '@/lib/group-slug';

export default async function CrossGroupSpeciesPage({
	params
}: {
	params: Promise<{ groupSlug: string }>;
}) {
	const { groupSlug } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) notFound();
	return <AllSpeciesPage viewedGroupId={viewedGroupId} />;
}
