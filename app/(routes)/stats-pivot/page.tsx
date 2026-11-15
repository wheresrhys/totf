import { fetchStatsPivotRows } from '@/app/actions/stats-pivot';
import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import type { StatsCacheResult } from '@/modules/stats/browser';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { StatsPivotPageContent } from './PageContent';

type PageProps = Record<string, never>;

export type StatsPivotPageData = {
	monthRows: StatsCacheResult[];
};

export async function fetchStatsPivotPageContent(
	params: Record<string, never>,
	viewedGroup: ViewedGroup
): Promise<StatsPivotPageData> {
	return { monthRows: await fetchStatsPivotRows(viewedGroup) };
}

export default async function StatsPivotPage(
	props: { viewedGroup?: ViewedGroup } = {}
) {
	return (
		<BootstrapPage<StatsPivotPageData, PageProps, Record<string, never>>
			pageProps={{}}
			viewedGroup={props.viewedGroup}
			getParams={async () => ({})}
			getCacheKeys={() => ['stats-pivot']}
			dataFetcher={fetchStatsPivotPageContent}
			PageComponent={StatsPivotPageContent}
		/>
	);
}
