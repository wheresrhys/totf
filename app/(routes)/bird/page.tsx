import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import {
	BirdSearchResults,
	type SearchResult
} from '@/app/components/BirdSearchResults';

type SearchParams = { q: string };
type PageProps = { searchParams: Promise<SearchParams> };

async function searchByRing({ q }: SearchParams, _viewedGroupId: number) {
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

export default async function BirdPage(props: PageProps) {
	return (
		<BootstrapPageData<SearchResult[], PageProps, SearchParams>
			pageProps={props}
			getParams={async (pageProps: PageProps) => ({
				q: (await pageProps.searchParams).q
			})}
			getCacheKeys={(params: SearchParams) => ['search', params.q]}
			dataFetcher={searchByRing}
			PageComponent={BirdSearchResults}
		/>
	);
}
