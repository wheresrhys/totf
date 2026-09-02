import {
	BootstrapPage,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	fetchPayOffStats,
	type PayOffStatsData
} from '@/app/actions/pay-off-stats';
import { EffortPageContent } from './PageContent';

export async function fetchEffortPageContent(
	_params: DefaultPageParams,
	viewedGroupId: number
): Promise<PayOffStatsData | null> {
	return fetchPayOffStats(viewedGroupId);
}

export default function EffortPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<PayOffStatsData>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['sessions', 'pay-off']}
			dataFetcher={fetchEffortPageContent}
			PageComponent={EffortPageContent}
		/>
	);
}
