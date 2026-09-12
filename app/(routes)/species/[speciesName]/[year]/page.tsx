import {
	BootstrapPage,
	defaultGetParams
} from '@/app/components/layout/BootstrapPage';
import { SpeciesPageContent, type PageData } from '../PageContent';
import { fetchSpeciesPageContentForPeriod } from '@/app/(routes)/species/[speciesName]/page';
import { readTabIdSearchParam } from '@/app/lib/tab-query-param';
import type { ViewedGroup } from '@/app/lib/group-slug';

export type PageParams = { speciesName: string; year: string; tabId?: string };
type PageProps = {
	params: Promise<{ speciesName: string; year: string }>;
	searchParams?: Promise<{ tabId?: string }>;
};

// Merges the route's `speciesName`/`year` with the optional `?tabId=` search
// param (#803) — see the bare species `page.tsx`'s `getSpeciesPageParams` for
// the shared rationale.
async function getSpeciesYearPageParams(
	pageProps: PageProps
): Promise<PageParams> {
	const { speciesName, year } = await defaultGetParams<
		PageProps,
		{ speciesName: string; year: string }
	>(pageProps);
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return { speciesName, year, ...(tabId ? { tabId } : {}) };
}

export async function fetchSpeciesYearPageContent(
	params: PageParams,
	viewedGroupId: number
): Promise<PageData | null> {
	// Whole-calendar-year range, mirroring `summary/[year]/page.tsx`.
	return fetchSpeciesPageContentForPeriod(params, viewedGroupId, {
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
			getParams={getSpeciesYearPageParams}
			getCacheKeys={(params: PageParams) => [
				'species',
				params.speciesName,
				params.year
			]}
			dataFetcher={fetchSpeciesYearPageContent}
			PageComponent={SpeciesPageContent}
		/>
	);
}
