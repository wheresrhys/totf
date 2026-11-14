import { fetchSpeciesComparisonStats } from '@/app/actions/compare-species';
import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import type { StatsCacheBySpeciesResult } from '@/modules/stats/browser';
import { parseSelectedSpeciesParam } from '@/app/lib/compare-species';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { CompareSpeciesPageContent } from './PageContent';

/** Repeated `?name=` params — one per preselected species (#115). */
export type CompareSpeciesSearchParams = {
	name?: string | string[];
};

export type CompareSpeciesParams = {
	selectedSpecies: string[];
};

export type CompareSpeciesPageData = {
	speciesStats: StatsCacheBySpeciesResult[];
};

type PageProps = { searchParams?: Promise<CompareSpeciesSearchParams> };

/**
 * The page's data doesn't depend on the selection at all — the selection is a
 * client-side filter over the one by-species dataset (see
 * `fetchSpeciesComparisonStats`) — so `params` isn't read here at all; the
 * content component reads it directly off `data`/its own URL-seeded state.
 */
export async function fetchCompareSpeciesPageContent(
	params: CompareSpeciesParams,
	viewedGroup: ViewedGroup
): Promise<CompareSpeciesPageData> {
	return { speciesStats: await fetchSpeciesComparisonStats(viewedGroup) };
}

export default async function CompareSpeciesPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPage<CompareSpeciesPageData, PageProps, CompareSpeciesParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={async (pageProps: PageProps) => ({
				selectedSpecies: parseSelectedSpeciesParam(
					(await pageProps.searchParams)?.name
				)
			})}
			getCacheKeys={() => ['compare-species']}
			dataFetcher={fetchCompareSpeciesPageContent}
			PageComponent={CompareSpeciesPageContent}
		/>
	);
}
