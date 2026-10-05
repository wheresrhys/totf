import { startOfMonth, endOfMonth, format } from 'date-fns';
import { notFound } from 'next/navigation';
import {
	BootstrapPage,
	defaultGetParams
} from '@/app/components/layout/BootstrapPage';
import { SpeciesPageContent, type PageData } from '../../PageContent';
import { fetchSpeciesPageContentForPeriod } from '@/app/(routes)/species/[speciesName]/page';
import { readTabIdSearchParam } from '@/app/lib/tab-query-param';
import { parseMonthAbbreviation } from '@/app/lib/squashed-month';
import type { ViewedGroup } from '@/app/lib/group-slug';

export type PageParams = {
	speciesName: string;
	yearOrMonth: string;
	month: string;
	tabId?: string;
};
type PageProps = {
	params: Promise<{ speciesName: string; yearOrMonth: string; month: string }>;
	searchParams?: Promise<{ tabId?: string }>;
};

// Merges the route's `speciesName`/`yearOrMonth`/`month` with the optional
// `?tabId=` search param (#803) — see the bare species `page.tsx`'s
// `getSpeciesPageParams` for the shared rationale.
async function getSpeciesYearMonthPageParams(
	pageProps: PageProps
): Promise<PageParams> {
	const { speciesName, yearOrMonth, month } = await defaultGetParams<
		PageProps,
		{ speciesName: string; yearOrMonth: string; month: string }
	>(pageProps);
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return { speciesName, yearOrMonth, month, ...(tabId ? { tabId } : {}) };
}

export async function fetchSpeciesYearMonthPageContent(
	params: PageParams,
	_unusedGroupId: number,
	viewedGroup: ViewedGroup
): Promise<PageData | null> {
	// A squashed month (e.g. `/species/{name}/jan/5`) has no single year to
	// drill a specific day-range into — this nested route only makes sense
	// under a real calendar year.
	if (parseMonthAbbreviation(params.yearOrMonth) !== undefined) {
		notFound();
	}
	// Calendar-month range, mirroring `summary/[yearOrMonth]/[month]/page.tsx`.
	const year = params.yearOrMonth;
	const monthDate = new Date(Number(year), Number(params.month) - 1, 1);
	const fromDate = format(startOfMonth(monthDate), 'yyyy-MM-dd');
	const toDate = format(endOfMonth(monthDate), 'yyyy-MM-dd');
	return fetchSpeciesPageContentForPeriod(params, viewedGroup, {
		year: Number(year),
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
				params.yearOrMonth,
				params.month
			]}
			dataFetcher={fetchSpeciesYearMonthPageContent}
			PageComponent={SpeciesPageContent}
		/>
	);
}
