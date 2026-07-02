import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import {
	fetchSessionData,
	SessionSummary,
	type DayData,
	type PageParams
} from '../../../_shared';

type PageProps = {
	params: Promise<{ id: string; date: string; locationId: string }>;
};

export default async function CrossGroupSessionSitePage({ params }: PageProps) {
	const { id, date, locationId } = await params;
	const viewedGroupId = Number(id);
	return (
		<BootstrapPageData<DayData, PageProps, PageParams>
			viewedGroupId={viewedGroupId}
			getParams={async () => ({
				viewedGroupId,
				date,
				locationId: Number(locationId)
			})}
			getCacheKeys={() => ['session', date, `loc-${locationId}`]}
			dataFetcher={fetchSessionData}
			PageComponent={SessionSummary}
			ttl={3600 * 24 * 7}
		/>
	);
}
