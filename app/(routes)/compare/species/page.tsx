import {
	fetchSpeciesComparisonStats,
	type SpeciesComparisonStats
} from '@/app/actions/compare-species';
import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { parseSelectedSpeciesParam } from '@/app/lib/compare-species';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { CompareSpeciesPageContent } from './PageContent';

/** Repeated `?name=` params — one per preselected species (#115). */
export type CompareSpeciesSearchParams = { name?: string | string[] };

export type CompareSpeciesParams = { selectedSpecies: string[] };

type PageProps = { searchParams?: Promise<CompareSpeciesSearchParams> };

/**
 * The page's data doesn't depend on the selection at all — the selection is a
 * client-side filter over all three by-species datasets (see
 * `fetchSpeciesComparisonStats`) — so the params are unused here.
 */
export async function fetchCompareSpeciesPageContent(
	_: CompareSpeciesParams,
	viewedGroupId: number
): Promise<SpeciesComparisonStats> {
	return fetchSpeciesComparisonStats(viewedGroupId);
}

export default async function CompareSpeciesPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPage<SpeciesComparisonStats, PageProps, CompareSpeciesParams>
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
