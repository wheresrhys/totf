import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	buildYearMonthHeading,
	parseMonthParam,
	parseYearParam
} from '../../_shared';

export type PageParams = { year: string; month: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = { year: number; month: number };

export async function fetchYearMonthHighlightsData(
	{ year, month }: PageParams,
	_viewedGroupId: number
): Promise<PageData | null> {
	const parsedYear = parseYearParam(year);
	const parsedMonth = parseMonthParam(month);
	if (parsedYear === null || parsedMonth === null) {
		return null;
	}
	return { year: parsedYear, month: parsedMonth };
}

function YearMonthHighlights({ data }: { data: PageData }) {
	return (
		<PageWrapper>
			<PrimaryHeading>
				{buildYearMonthHeading(data.year, data.month)}
			</PrimaryHeading>
		</PageWrapper>
	);
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
