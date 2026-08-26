import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { fetchSessionStats } from '@/lib/underlying-stats';
import { fetchSummaryStats } from '@/app/actions/summary-stats';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import type { ViewedGroup } from '@/lib/group-slug';
import type { AggregateStatsResult } from '@/app/models/db';
import { SummaryPage as SummaryPageContent } from '../_shared';

export type PageParams = { year: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = {
	year: number;
	summaryStats: AggregateStatsResult | null;
	speciesStats: AggregateStatsResult[];
};

export async function fetchYearSummaryData(
	{ year }: PageParams,
	viewedGroupId: number
): Promise<PageData> {
	const [summaryStats, speciesStats] = await Promise.all([
		fetchSummaryStats(viewedGroupId, `${year}-01-01`, `${year}-12-31`),
		fetchSpeciesData(viewedGroupId, `${year}-01-01`, `${year}-12-31`)
	]);
	return {
		year: Number(year),
		summaryStats,
		speciesStats
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
			summaryStats={data.summaryStats}
			speciesStats={data.speciesStats}
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
