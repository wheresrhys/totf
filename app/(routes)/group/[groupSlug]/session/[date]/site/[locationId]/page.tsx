import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { withGroupScope } from '@/app/components/layout/withGroupScope';
import { readTabIdSearchParam } from '@/app/lib/tab-query-param';
import { fetchSessionPageContent } from '../../page';
import {
	SessionPageContent,
	type DayData,
	type PageParams
} from '../../PageContent';

type PageProps = {
	params: Promise<{ groupSlug: string; date: string; locationId: string }>;
};

export default withGroupScope<{ date: string; locationId: string }>(
	({ viewedGroup, params, searchParams }) => (
		<BootstrapPage<DayData, PageProps, PageParams>
			viewedGroup={viewedGroup}
			getParams={async () => ({
				viewedGroupId: viewedGroup.id,
				date: params.date,
				locationId: Number(params.locationId),
				tabId: await readTabIdSearchParam(searchParams)
			})}
			getCacheKeys={() => ['session', params.date, `loc-${params.locationId}`]}
			dataFetcher={fetchSessionPageContent}
			PageComponent={SessionPageContent}
			ttl={3600 * 24 * 7}
		/>
	)
);
