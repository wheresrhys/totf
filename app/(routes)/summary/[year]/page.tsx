import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import {
	fetchSummaryStats,
	fetchPeriodStats
} from '@/app/actions/summary-stats';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import type { ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import {
	buildMonthTotalsRows,
	type MonthTotalsRow
} from '@/app/models/month-totals';
import { SummaryPage as SummaryPageContent } from '../_shared';

export type PageParams = { year: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = {
	year: number;
	summaryStats: AggregateStatsResult | null;
	speciesStats: AggregateStatsResult[];
	monthTotals: MonthTotalsRow[];
};

export async function fetchYearSummaryData(
	{ year }: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const [summaryStats, speciesStats, monthlyStats] = await Promise.all([
		fetchSummaryStats(viewedGroupId, `${year}-01-01`, `${year}-12-31`),
		fetchSpeciesData(viewedGroupId, `${year}-01-01`, `${year}-12-31`),
		fetchPeriodStats(viewedGroupId, 'month', `${year}-01-01`, `${year}-12-31`)
	]);
	return {
		year: Number(year),
		summaryStats,
		speciesStats,
		monthTotals: buildMonthTotalsRows(Number(year), monthlyStats)
	};
}

function YearSummary({ data }: { data: PageData; viewedGroup: ViewedGroup }) {
	return (
		<SummaryPageContent
			year={data.year}
			summaryStats={data.summaryStats}
			speciesStats={data.speciesStats}
			monthTotals={data.monthTotals}
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
