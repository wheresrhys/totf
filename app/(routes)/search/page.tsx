import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { resolveRingSearchDestination } from '@/app/actions/ring-search';
import { SearchPageContent, type SearchResult } from './PageContent';

export type SearchParams = { q: string };

export async function fetchSearchPageContent({
	q
}: SearchParams): Promise<SearchResult[]> {
	// Reached directly (bookmark, shared link, browser back/forward) rather
	// than only via RingSearchForm's own pre-navigation check — see #950 —
	// so this must still redirect an exact match itself.
	const { isExactMatch, path } = await resolveRingSearchDestination(q);
	if (isExactMatch) {
		return redirect(path);
	}
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('fuzzy_search_rings', { q: q.toUpperCase() })
		.then(catchSupabaseErrors);
}

type PageProps = { searchParams: Promise<SearchParams> };

export default async function SearchPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPage<SearchResult[], PageProps, SearchParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={async (pageProps: PageProps) => ({
				q: (await pageProps.searchParams).q
			})}
			getCacheKeys={(params: SearchParams) => ['search', params.q]}
			dataFetcher={fetchSearchPageContent}
			PageComponent={SearchPageContent}
		/>
	);
}
