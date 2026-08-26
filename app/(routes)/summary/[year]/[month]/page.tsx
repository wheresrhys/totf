import { startOfMonth, endOfMonth, format } from 'date-fns';
import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSessionStats } from '@/lib/underlying-stats';
import { fetchSummaryStats } from '@/app/actions/summary-stats';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import type { ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import { SummaryPage as SummaryPageContent } from '../../_shared';

export type PageParams = { year: string; month: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = {
	year: number;
	month: number;
	summaryStats: AggregateStatsResult | null;
	speciesStats: AggregateStatsResult[];
};

export async function fetchYearMonthSummaryData(
	{ year, month }: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const monthDate = new Date(Number(year), Number(month) - 1, 1);
	const fromDate = format(startOfMonth(monthDate), 'yyyy-MM-dd');
	const toDate = format(endOfMonth(monthDate), 'yyyy-MM-dd');
	const [summaryStats, speciesStats] = await Promise.all([
		fetchSummaryStats(viewedGroupId, fromDate, toDate),
		fetchSpeciesData(viewedGroupId, fromDate, toDate)
	]);
	const monthPrefix = `${year}-${String(Number(month)).padStart(2, '0')}`;
	return {
		year: Number(year),
		month: Number(month),
		summaryStats,
		speciesStats
	};
}

function YearMonthSummary({
	data,
	viewedGroup
}: {
	data: PageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<SummaryPageContent
			year={data.year}
			month={data.month}
			summaryStats={data.summaryStats}
			speciesStats={data.speciesStats}
			viewedGroup={viewedGroup}
		/>
	);
}

export default async function YearMonthSummaryPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPageData<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getCacheKeys={(params: PageParams) => [
				'summary',
				params.year,
				params.month
			]}
			dataFetcher={fetchYearMonthSummaryData}
			PageComponent={YearMonthSummary}
		/>
	);
}
