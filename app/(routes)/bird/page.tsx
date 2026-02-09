import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import {
	BoxyList,
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { RingSearchForm } from '@/app/components/shared/RingSearchForm';

type SearchResult = {
	ring_no: string;
	species_name: string;
	closeness_score: number;
};

type SearchParams = { q: string };
type PageProps = { searchParams: Promise<SearchParams> };

async function getParticalMatches(q: string): Promise<SearchResult[]> {
	const matches = await supabase
		.from('Birds')
		.select('ring_no, species:Species(species_name)')
		.like('ring_no', `%${q}%`)
		.then(catchSupabaseErrors);
	return (
		matches
			? matches.map(({ ring_no, species: { species_name } }) => ({
					ring_no,
					species_name
				}))
			: []
	) as SearchResult[];
}

async function searchByRing({ q }: SearchParams) {
	const uppercaseQuery = q.toUpperCase();
	// 1. fetch by uppercase ring number - exact match
	//   if success, redirect
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

function SearchResults({
	params: { q },
	data
}: {
	params: SearchParams;
	data: SearchResult[];
}) {
	// TODO force search bar to be expanded with query in the input
	// proabbly need to await params in global nav
	return (
		<PageWrapper>
			<PrimaryHeading>Search results</PrimaryHeading>
			<p>No exact match found for {q}. Showing closest matches.</p>
			<div className="mt-4 mb-4 w-full sm:w-1/2 lg:w-1/3 xl:w-1/4">
				{' '}
				<RingSearchForm q={q} buttonText="Search again" />
			</div>
			<BoxyList>
				{data.map(({ ring_no, species_name, closeness_score }) => (
					<li key={ring_no}>
						<Link className="link" href={`/bird/${ring_no}`}>
							{ring_no}: {species_name}
						</Link>
					</li>
				))}
			</BoxyList>
		</PageWrapper>
	);
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
			PageComponent={SearchResults}
		/>
	);
}
