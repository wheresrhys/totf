import { DiscrepenciesResult } from '@/app/models/db';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { readTabIdSearchParam } from '@/app/lib/tab-query-param';
import { MistakesPageContent, type PageParams } from './PageContent';

type PageProps = { searchParams?: Promise<{ tabId?: string }> };

// Threads the raw `?tabId=` search param (#803's mechanism) down to
// `MistakesPageContent`. Deliberately *not* resolved against the page's tab
// ids here, the way every other tabbed page's `getParams` does it: this
// page's tab ids are its discrepancy types, which don't exist until
// `fetchMistakesPageContent` has run. See `PageContent.tsx`.
async function getMistakesPageParams(
	pageProps: PageProps
): Promise<PageParams> {
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return tabId ? { tabId } : {};
}

export async function fetchMistakesPageContent(
	_: PageParams,
	viewedGroupId: number
): Promise<DiscrepenciesResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('find_discrepencies', { ringing_group_filter: viewedGroupId })
		.then(catchSupabaseErrors) as Promise<DiscrepenciesResult[]>;
}

export default async function MistakesPage(
	props: PageProps & { viewedGroup?: ViewedGroup } = {}
) {
	return (
		<BootstrapPage<DiscrepenciesResult[], PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={getMistakesPageParams}
			getCacheKeys={() => ['mistakes']}
			dataFetcher={fetchMistakesPageContent}
			PageComponent={MistakesPageContent}
		/>
	);
}
