import { startOfMonth, endOfMonth, format } from 'date-fns';
import {
	BootstrapPage,
	defaultGetParams
} from '@/app/components/layout/BootstrapPage';
import { SpeciesPageContent, type PageData } from '../../PageContent';
import { fetchSpeciesPageContentForPeriod } from '@/app/(routes)/species/[speciesName]/page';
import { readTabIdSearchParam } from '@/app/lib/tab-query-param';
import type { ViewedGroup } from '@/app/lib/group-slug';

export type PageParams = {
	speciesName: string;
	year: string;
	month: string;
	tabId?: string;
};
type PageProps = {
	params: Promise<{ speciesName: string; year: string; month: string }>;
	searchParams?: Promise<{ tabId?: string }>;
};

// Merges the route's `speciesName`/`year`/`month` with the optional
// `?tabId=` search param (#803) — see the bare species `page.tsx`'s
// `getSpeciesPageParams` for the shared rationale.
async function getSpeciesYearMonthPageParams(
	pageProps: PageProps
): Promise<PageParams> {
	const { speciesName, year, month } = await defaultGetParams<
		PageProps,
		{ speciesName: string; year: string; month: string }
	>(pageProps);
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return { speciesName, year, month, ...(tabId ? { tabId } : {}) };
}

export async function fetchSpeciesYearMonthPageContent(
	params: PageParams,
	viewedGroupId: number
): Promise<PageData | null> {
	// Calendar-month range, mirroring `summary/[year]/[month]/page.tsx`.
	const monthDate = new Date(Number(params.year), Number(params.month) - 1, 1);
	const fromDate = format(startOfMonth(monthDate), 'yyyy-MM-dd');
	const toDate = format(endOfMonth(monthDate), 'yyyy-MM-dd');
	return fetchSpeciesPageContentForPeriod(params, viewedGroupId, {
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
		<BootstrapPage<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={getSpeciesYearMonthPageParams}
			getCacheKeys={(params: PageParams) => [
				'species',
				params.speciesName,
				params.year,
				params.month
			]}
			dataFetcher={fetchSpeciesYearMonthPageContent}
			PageComponent={SpeciesPageContent}
		/>
	);
}
