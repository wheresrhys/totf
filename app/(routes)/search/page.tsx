import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import type { ViewedGroup } from '@/lib/group-slug';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { SearchPageContent, type SearchResult } from './PageContent';

export type SearchParams = { q: string };

export async function fetchSearchPageContent(
	{ q }: SearchParams,
	_viewedGroupId: number
): Promise<SearchResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const uppercaseQuery = q.toUpperCase();
	const exactMatch = await supabase
		.from('Birds')
		.select('id')
		.eq('ring_no', uppercaseQuery)
		.maybeSingle()
		.then(catchSupabaseErrors);

	if (exactMatch) {
		return redirect(`/bird/${q}`);
	}
	return supabase
		.rpc('fuzzy_search_rings', { q: uppercaseQuery })
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
