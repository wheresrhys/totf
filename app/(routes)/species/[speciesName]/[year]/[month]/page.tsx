import { startOfMonth, endOfMonth, format } from 'date-fns';
import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { SpPage } from '@/app/components/SpPage';
import {
	fetchSpPageDataForPeriod,
	type PageData
} from '@/app/(routes)/species/[speciesName]/page';
import type { ViewedGroup } from '@/lib/group-slug';

export type PageParams = { speciesName: string; year: string; month: string };
type PageProps = { params: Promise<PageParams> };

export async function fetchSpYearMonthPageData(
	params: PageParams,
	viewedGroupId: number
): Promise<PageData | null> {
	// Calendar-month range, mirroring `summary/[year]/[month]/page.tsx`.
	const monthDate = new Date(Number(params.year), Number(params.month) - 1, 1);
	const fromDate = format(startOfMonth(monthDate), 'yyyy-MM-dd');
	const toDate = format(endOfMonth(monthDate), 'yyyy-MM-dd');
	return fetchSpPageDataForPeriod(params, viewedGroupId, {
		year: Number(params.year),
		month: Number(params.month),
		fromDate,
		toDate
	});
}

export default async function SpeciesYearMonthPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPageData<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getCacheKeys={(params: PageParams) => [
				'species',
				params.speciesName,
				params.year,
				params.month
			]}
			dataFetcher={fetchSpYearMonthPageData}
			PageComponent={SpPage}
		/>
	);
}
