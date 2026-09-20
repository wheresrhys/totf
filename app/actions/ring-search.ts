'use server';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';

export type RingSearchDestination = {
	isExactMatch: boolean;
	path: string;
};

// Resolves where a ring-number search should navigate to: a bird's own page
// on an exact match, or the fuzzy-results search page otherwise. Called
// directly from RingSearchForm's submit handler (rather than letting the
// client navigate to `/search?q=...` and have that page's Server Component
// perform the redirect) so each search's destination is computed by its own
// isolated request/response pair instead of being resolved via a client-side
// navigation to a shared dynamic route — seeing #950, where two searches in
// quick succession to `/search` with different `q` values, both resolving
// via a `redirect()` thrown mid-render, sometimes had the first repeat
// search land on the previous search's destination instead of its own
// (a Next.js App Router client-navigation/redirect interaction, not
// anything specific to the query values themselves). `fetchSearchPageContent`
// (`app/(routes)/search/page.tsx`) still performs its own exact-match check
// via this same function, since `/search?q=<exact ring>` must still redirect
// correctly when reached directly (bookmark, shared link, browser back).
export async function resolveRingSearchDestination(
	ring: string
): Promise<RingSearchDestination> {
	const supabase = await getAuthenticatedSupabaseClient();
	const exactMatch = await supabase
		.from('Birds')
		.select('id')
		.eq('ring_no', ring.toUpperCase())
		.maybeSingle()
		.then(catchSupabaseErrors);

	return exactMatch
		? { isExactMatch: true, path: `/bird/${ring}` }
		: { isExactMatch: false, path: `/search?q=${ring}` };
}
