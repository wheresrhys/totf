import { ResightingEncounter } from '@/app/models/session';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { RESIGHTING_RECORD_TYPES } from '@/lib/demon-import';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import {
	prefetchActiveTabData,
	readTabIdSearchParam,
	resolveInitialTabId
} from '@/app/lib/tab-query-param';
import {
	ALL_RESIGHTINGS_TAB_ID,
	groupResightingsBySpecies
} from '@/app/lib/resightings';
import { resightingsQuery } from '@/queries';
import { ResightingsPageContent } from './PageContent';

// `tabId` is the optional `?tabId=` search param (#803's mechanism). It never
// affects `getCacheKeys` — only which species tab `ResightingsPageContent`
// focuses first.
export type ResightingsPageParams = { tabId?: string };
type PageProps = { searchParams?: Promise<{ tabId?: string }> };

export type ResightingsPageData = {
	resightings: ResightingEncounter[];
	// The `?tabId=` param already resolved against the tabs this render will
	// actually have, so the content component never has to re-derive it.
	initialTabId: string;
	initialTabData?: { tabId: string; data: unknown };
};

async function getResightingsPageParams(
	pageProps: PageProps
): Promise<ResightingsPageParams> {
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return tabId ? { tabId } : {};
}

export async function fetchResightingsPageContent(
	params: ResightingsPageParams,
	viewedGroupId: number
): Promise<ResightingsPageData> {
	const supabase = await getAuthenticatedSupabaseClient();
	const resightings = (await supabase
		.from('Encounters')
		.select(resightingsQuery.select)
		.eq('ringing_group_id', viewedGroupId)
		.in('record_type', [...RESIGHTING_RECORD_TYPES])
		.then(catchSupabaseErrors)) as ResightingEncounter[];

	// Unlike every other tabbed page, resightings' tab list is fully
	// data-driven — one tab per species actually present — so the `?tabId=`
	// param can only be validated once the data is in hand. Resolving it here,
	// rather than in a separate pass over the same query, is what keeps this to
	// a single Supabase round-trip.
	const tabIds = Object.keys(groupResightingsBySpecies(resightings));
	const initialTabId = resolveInitialTabId(
		params.tabId,
		tabIds,
		ALL_RESIGHTINGS_TAB_ID
	);
	// Always `undefined` today: no resightings tab has a `dataFetcher`, since
	// every tab renders a filtered view of the resightings already fetched
	// above. Wired anyway so the page follows the standard
	// resolve-then-prefetch shape, and so a future per-species `dataFetcher`
	// gets server-side prefetching for free.
	const initialTabData = await prefetchActiveTabData(
		tabIds.map((id) => ({ id })),
		initialTabId,
		resightings,
		// No full `ViewedGroup` (with slug) is resolved at this point in
		// `BootstrapPage` — only the numeric id — and nothing prefetched here
		// reads the slug.
		{ id: viewedGroupId, slug: null }
	);
	return { resightings, initialTabId, initialTabData };
}

function ResightingsTabbedPage({
	data,
	viewedGroup
}: {
	data: ResightingsPageData;
	viewedGroup: ViewedGroup;
}) {
	return (
		<ResightingsPageContent
			data={data.resightings}
			viewedGroup={viewedGroup}
			initialTabId={data.initialTabId}
			initialTabData={data.initialTabData}
		/>
	);
}

export default async function ResightingsPage(
	props: PageProps & { viewedGroup?: ViewedGroup } = {}
) {
	return (
		<BootstrapPage<ResightingsPageData, PageProps, ResightingsPageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={getResightingsPageParams}
			getCacheKeys={() => ['resightings']}
			dataFetcher={fetchResightingsPageContent}
			PageComponent={ResightingsTabbedPage}
		/>
	);
}
