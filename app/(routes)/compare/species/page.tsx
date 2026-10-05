import {
	fetchSpeciesComparisonStats,
	type SpeciesComparisonStats
} from '@/app/actions/compare-species';
import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import type { TabConfig } from '@/app/components/shared/TabContent';
import {
	COMPARE_SPECIES_TAB_IDS,
	CORE_DATASET_TAB_ID,
	type CompareSpeciesTabParams
} from '@/app/components/pages/compare-species/compare-species-tab-params';
import { parseSelectedSpeciesParam } from '@/app/lib/compare-species';
import {
	prefetchActiveTabData,
	readTabIdSearchParam,
	resolveInitialTabId
} from '@/app/lib/tab-query-param';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { CompareSpeciesPageContent } from './PageContent';

/**
 * Repeated `?name=` params — one per preselected species (#115) — plus the
 * shared `?tabId=` dataset deep link (#1069).
 */
export type CompareSpeciesSearchParams = {
	name?: string | string[];
	tabId?: string;
};

export type CompareSpeciesParams = {
	selectedSpecies: string[];
	/** Already resolved against the known tab ids — never a garbage `?tabId=`. */
	activeTabId: string;
};

export type CompareSpeciesPageData = SpeciesComparisonStats & {
	initialTabData?: { tabId: string; data: unknown };
};

type PageProps = { searchParams?: Promise<CompareSpeciesSearchParams> };

/**
 * What `prefetchActiveTabData` is pointed at. Both dataset tabs are prop-fed
 * and declare no `dataFetcher` at all (the page's single
 * `fetchSpeciesComparisonStats` call already returns both datasets), so this is
 * id-only and the prefetch resolves to `undefined` every time — which is the
 * point: the list is the page's *declaration* of what each tab's fetch story
 * is, and a future dataset tab that does want a server-side prefetch only has
 * to say so here rather than re-touching the wiring below.
 */
const compareSpeciesTabPrefetchers: Pick<
	TabConfig<unknown, CompareSpeciesTabParams>,
	'id' | 'dataFetcher'
>[] = COMPARE_SPECIES_TAB_IDS.map((id) => ({ id }));

/**
 * The page's data doesn't depend on the selection at all — the selection is a
 * client-side filter over both by-species datasets (see
 * `fetchSpeciesComparisonStats`) — so `params` is only read for the already
 * resolved `activeTabId`.
 */
export async function fetchCompareSpeciesPageContent(
	params: CompareSpeciesParams,
	_unusedGroupId: number,
	viewedGroup: ViewedGroup
): Promise<CompareSpeciesPageData> {
	const comparisonStats = await fetchSpeciesComparisonStats(viewedGroup);
	const initialTabData = await prefetchActiveTabData<
		CompareSpeciesTabParams,
		CompareSpeciesTabParams[]
	>(
		compareSpeciesTabPrefetchers,
		params.activeTabId,
		{ ...comparisonStats, selectedSpecies: params.selectedSpecies },
		viewedGroup
	);
	return { ...comparisonStats, initialTabData };
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
				),
				activeTabId: resolveInitialTabId(
					await readTabIdSearchParam(pageProps.searchParams),
					COMPARE_SPECIES_TAB_IDS,
					CORE_DATASET_TAB_ID
				)
			})}
			getCacheKeys={() => ['compare-species']}
			dataFetcher={fetchCompareSpeciesPageContent}
			PageComponent={CompareSpeciesPageContent}
		/>
	);
}
