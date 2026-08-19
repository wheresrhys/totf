import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { resolveGroupSlugById } from '@/lib/group-slug';
import {
	fetchSessionData,
	SessionSummary,
	type DayData,
	type PageParams
} from '../../../_shared';

type PageProps = {
	params: Promise<{ groupId: string; date: string; locationId: string }>;
};

export default async function CrossGroupSessionSitePage({ params }: PageProps) {
	const { groupId, date, locationId } = await params;
	const viewedGroupId = Number(groupId);
	const viewedGroup = {
		id: viewedGroupId,
		slug: await resolveGroupSlugById(viewedGroupId)
	};
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
