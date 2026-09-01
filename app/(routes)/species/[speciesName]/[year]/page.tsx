import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { SpPage } from '@/app/components/SpPage';
import {
	fetchSpPageDataForPeriod,
	type PageData
} from '@/app/(routes)/species/[speciesName]/page';
import type { ViewedGroup } from '@/lib/group-slug';

export type PageParams = { speciesName: string; year: string };
type PageProps = { params: Promise<PageParams> };

export async function fetchSpYearPageData(
	params: PageParams,
	viewedGroupId: number
): Promise<PageData | null> {
	// Whole-calendar-year range, mirroring `summary/[year]/page.tsx`.
	return fetchSpPageDataForPeriod(params, viewedGroupId, {
		year: Number(params.year),
		fromDate: `${params.year}-01-01`,
		toDate: `${params.year}-12-31`
	});
}

export default async function SpeciesYearPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPage<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getCacheKeys={(params: PageParams) => [
				'species',
				params.speciesName,
				params.year
			]}
			dataFetcher={fetchSpYearPageData}
			PageComponent={SpPage}
		/>
	);
}
