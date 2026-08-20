import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import type { ViewedGroup } from '@/lib/group-slug';
import { HighlightsHeading } from '../../_shared';

export type PageParams = { year: string; month: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = { year: number; month: number };

export async function fetchYearMonthHighlightsData(
	{ year, month }: PageParams,
	_viewedGroupId: number
): Promise<PageData> {
	return { year: Number(year), month: Number(month) };
}

function YearMonthHighlights({ data }: { data: PageData }) {
	return <HighlightsHeading year={data.year} month={data.month} />;
}

export default async function YearMonthHighlightsPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPageData<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getCacheKeys={(params: PageParams) => [
				'highlights',
				params.year,
				params.month
			]}
			dataFetcher={fetchYearMonthHighlightsData}
			PageComponent={YearMonthHighlights}
		/>
	);
}
