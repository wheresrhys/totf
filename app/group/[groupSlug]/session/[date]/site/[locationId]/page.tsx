import { notFound } from 'next/navigation';
import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { resolveGroupIdBySlug } from '@/lib/group-slug';
import {
	fetchSessionData,
	SessionSummary,
	type DayData,
	type PageParams
} from '../../../_shared';

type PageProps = {
	params: Promise<{ groupSlug: string; date: string; locationId: string }>;
};

export default async function CrossGroupSessionSitePage({ params }: PageProps) {
	const { groupSlug, date, locationId } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) {
		notFound();
	}
	const viewedGroup = { id: viewedGroupId, slug: groupSlug };
	return (
		<BootstrapPageData<DayData, PageProps, PageParams>
			viewedGroup={viewedGroup}
			getParams={async () => ({
				viewedGroupId,
				date,
				locationId: Number(locationId),
				viewedGroup
			})}
			getCacheKeys={() => ['session', date, `loc-${locationId}`]}
			dataFetcher={fetchSessionData}
			PageComponent={SessionSummary}
			ttl={3600 * 24 * 7}
		/>
	);
}
