import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import type { ViewedGroup } from '@/lib/group-slug';
import { HighlightsPage as HighlightsPageContent } from '../_shared';

export type PageParams = { year: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = { year: number };

export async function fetchYearHighlightsData(
	{ year }: PageParams,
	_viewedGroupId: number
): Promise<PageData> {
	return { year: Number(year) };
}

function YearHighlights({ data }: { data: PageData }) {
	return <HighlightsPageContent year={data.year} />;
}

export default async function YearHighlightsPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPageData<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getCacheKeys={(params: PageParams) => ['highlights', params.year]}
			dataFetcher={fetchYearHighlightsData}
			PageComponent={YearHighlights}
		/>
	);
}
