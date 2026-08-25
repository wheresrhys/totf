import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSessionStats } from '@/lib/underlying-stats';
import { fetchSummaryStats } from '@/app/actions/summary-stats';
import type { ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import { SummaryPage as SummaryPageContent } from '../_shared';

export type PageParams = { year: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = {
	year: number;
	sessionDates: string[];
	summaryStats: AggregateStatsResult | null;
};

export async function fetchYearSummaryData(
	{ year }: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const { sessionDates } = await fetchSessionStats(viewedGroupId);
	const summaryStats = await fetchSummaryStats(
		viewedGroupId,
		`${year}-01-01`,
		`${year}-12-31`
	);
	return {
		year: Number(year),
		sessionDates: sessionDates.filter((date) => date.slice(0, 4) === year),
		summaryStats
	};
}

function YearSummary({
	data,
	viewedGroup
}: {
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<SummaryPageContent
			year={data.year}
			sessionDates={data.sessionDates}
			summaryStats={data.summaryStats}
			viewedGroup={viewedGroup}
		/>
	);
}

export default async function YearSummaryPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPageData<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getCacheKeys={(params: PageParams) => ['summary', params.year]}
			dataFetcher={fetchYearSummaryData}
			PageComponent={YearSummary}
		/>
	);
}
