import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import type { ViewedGroup } from '@/lib/group-slug';
import type { SearchResult } from '@/app/components/SearchResults';
import {
	fetchSearchPageContent,
	SearchPageContent,
	type SearchParams
} from './PageContent';

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
