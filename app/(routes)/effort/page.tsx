import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import type { ViewedGroup } from '@/lib/group-slug';
import type { PayOffStatsData } from '@/app/actions/pay-off-stats';
import { fetchEffortPageContent, EffortPageContent } from './PageContent';

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
