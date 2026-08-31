import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import type { SearchResult } from '@/app/components/pages/search/SearchResults';

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

export {
	SearchResults as SearchPageContent,
	type SearchResult
} from '@/app/components/pages/search/SearchResults';
