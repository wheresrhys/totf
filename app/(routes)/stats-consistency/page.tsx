import {
	BootstrapPage,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { fetchOwnGroupImportJobs } from '@/app/actions/import-jobs';
import {
	StatsConsistencyPageContent,
	type StatsConsistencyPageData
} from './PageContent';

export async function fetchStatsConsistencyPageContent(
	_params: DefaultPageParams,
	_viewedGroup: ViewedGroup
): Promise<StatsConsistencyPageData> {
	const importJobs = await fetchOwnGroupImportJobs();
	return { importJobs };
}

export default async function StatsConsistencyPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<StatsConsistencyPageData>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['stats-consistency']}
			dataFetcher={fetchStatsConsistencyPageContent}
			PageComponent={StatsConsistencyPageContent}
		/>
	);
}
