import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import {
	fetchSummaryStats,
	fetchYearlyTotals
} from '@/app/actions/summary-stats';
import { readTabIdSearchParam } from '@/app/lib/tab-query-param';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { CoreStatsResult } from '@/app/models/db';
import { SummaryPageContent } from './PageContent';

// `tabId` (#804, reusing #803's mechanism) is the optional `?tabId=` search
// param — it never affects `getCacheKeys`, only which tab
// `SummaryTotalsSection` focuses/loads first.
export type PageParams = { tabId?: string };
type PageProps = { searchParams?: Promise<{ tabId?: string }> };

export type PageData = {
	summaryStats: CoreStatsResult | null;
	yearlyTotals: CoreStatsResult[];
};

async function getSummaryPageParams(pageProps: PageProps): Promise<PageParams> {
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return tabId ? { tabId } : {};
}

export async function fetchSummaryPageContent(
	_params: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const [summaryStats, yearlyTotals] = await Promise.all([
		fetchSummaryStats(viewedGroupId),
		fetchYearlyTotals(viewedGroupId)
	]);
	return { summaryStats, yearlyTotals };
}

function AllTimeSummary({
	params,
	data,
	viewedGroup
}: {
	params: PageParams;
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<SummaryPageContent
			summaryStats={data.summaryStats}
			yearlyTotals={data.yearlyTotals}
			showAllTimeMonthTotals
			viewedGroup={viewedGroup}
			initialTabId={params.tabId}
		/>
	);
}

export default async function SummaryPage(
	props: PageProps & { viewedGroup?: ViewedGroup } = {}
) {
	return (
		<BootstrapPage<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={getSummaryPageParams}
			getCacheKeys={() => ['summary']}
			dataFetcher={fetchSummaryPageContent}
			PageComponent={AllTimeSummary}
		/>
	);
}
