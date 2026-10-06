import {
	BootstrapPage,
	defaultGetParams
} from '@/app/components/layout/BootstrapPage';
import { SpeciesPageContent, type PageData } from '../PageContent';
import { fetchSpeciesPageContentForPeriod } from '@/app/(routes)/species/[speciesName]/page';
import { readTabIdSearchParam } from '@/app/lib/tab-query-param';
import { parseMonthAbbreviation } from '@/app/lib/squashed-month';
import type { ViewedGroup } from '@/app/lib/group-slug';

export type PageParams = {
	speciesName: string;
	yearOrMonth: string;
	tabId?: string;
};
type PageProps = {
	params: Promise<{ speciesName: string; yearOrMonth: string }>;
	searchParams?: Promise<{ tabId?: string }>;
};

// Merges the route's `speciesName`/`yearOrMonth` with the optional `?tabId=`
// search param (#803) — see the bare species `page.tsx`'s
// `getSpeciesPageParams` for the shared rationale.
async function getSpeciesYearOrMonthPageParams(
	pageProps: PageProps
): Promise<PageParams> {
	const { speciesName, yearOrMonth } = await defaultGetParams<
		PageProps,
		{ speciesName: string; yearOrMonth: string }
	>(pageProps);
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return { speciesName, yearOrMonth, ...(tabId ? { tabId } : {}) };
}

export async function fetchSpeciesYearOrMonthPageContent(
	params: PageParams,
	viewedGroup: ViewedGroup
): Promise<PageData | null> {
	const squashedMonth = parseMonthAbbreviation(params.yearOrMonth);
	if (squashedMonth !== undefined) {
		return fetchSpeciesPageContentForPeriod(params, viewedGroup, {
			squashedMonth
		});
	}
	// Whole-calendar-year range, mirroring `summary/[yearOrMonth]/page.tsx`.
	return fetchSpeciesPageContentForPeriod(params, viewedGroup, {
		year: Number(params.yearOrMonth),
		fromDate: `${params.yearOrMonth}-01-01`,
		toDate: `${params.yearOrMonth}-12-31`
	});
}

export default async function SpeciesYearOrMonthPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPage<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={getSpeciesYearOrMonthPageParams}
			getCacheKeys={(params: PageParams) => [
				'species',
				params.speciesName,
				params.yearOrMonth
			]}
			dataFetcher={fetchSpeciesYearOrMonthPageContent}
			PageComponent={SpeciesPageContent}
		/>
	);
}
