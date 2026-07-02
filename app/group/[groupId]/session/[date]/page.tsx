import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
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
	return (
		<BootstrapPageData<DayData, PageProps, PageParams>
			viewedGroupId={viewedGroupId}
			getParams={async () => ({ viewedGroupId, date, locationId: undefined })}
			getCacheKeys={() => ['session', date]}
			dataFetcher={fetchSessionData}
			PageComponent={SessionSummary}
			ttl={3600 * 24 * 7}
		/>
	);
}
