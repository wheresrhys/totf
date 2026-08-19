import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { resolveGroupSlugById } from '@/lib/group-slug';
import {
	fetchSessionData,
	SessionSummary,
	type DayData,
	type PageParams
} from '../_shared';

type PageProps = { params: Promise<{ groupId: string; date: string }> };

export default async function CrossGroupSessionPage({ params }: PageProps) {
	const { groupId, date } = await params;
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
				locationId: undefined,
				viewedGroup
			})}
			getCacheKeys={() => ['session', date]}
			dataFetcher={fetchSessionData}
			PageComponent={SessionSummary}
			ttl={3600 * 24 * 7}
		/>
	);
}
