import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import type { ViewedGroup } from '@/lib/group-slug';
import { buildYearHeading, parseYearParam } from '../_shared';

export type PageParams = { year: string };
type PageProps = { params: Promise<PageParams> };

export type PageData = { year: number };

export async function fetchYearHighlightsData(
	{ year }: PageParams,
	_viewedGroupId: number
): Promise<PageData | null> {
	const parsedYear = parseYearParam(year);
	if (parsedYear === null) {
		return null;
	}
	return { year: parsedYear };
}

function YearHighlights({ data }: { data: PageData }) {
	return (
		<PageWrapper>
			<PrimaryHeading>{buildYearHeading(data.year)}</PrimaryHeading>
		</PageWrapper>
	);
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
