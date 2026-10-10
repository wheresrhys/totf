// The session page's tab wiring that both sides of the server/client boundary
// need: the shared `params` shape every session tab is handed, the Highlights
// tab's `dataFetcher`, and the descriptor list `page.tsx` prefetches against.
//
// Deliberately **not** a `'use client'` module, because `page.tsx` — a server
// component — imports `sessionTabPrefetchers` from it, and a server component
// importing a `'use client'` module only ever gets client references back.
// Nothing here is ever *called* server-side (see `sessionTabPrefetchers`), but
// the descriptor list itself has to be readable there.
import { getCondensedHighlightsAtTimePeriod } from '@/app/lib/highlights';
import { getAllHighlightsAcrossScopes } from '@/app/lib/highlights/lib/hg2';
import type { CombinedHighlight } from '@/app/lib/highlights/types';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { NetRound } from '@/app/lib/session-chronology';
import type {
	SessionEncounter,
	SpeciesWithEncounters
} from '@/app/models/session';

/**
 * The one `params` object `TabSet` hands to every session tab. Three of the
 * four tabs take all their content from here (it is all derived from the
 * page-wide encounters fetch, so none of them has a `dataFetcher` of its own);
 * the Highlights tab reads only `date` and `oldestEncounter` off it, and gets
 * the rest from `fetchSessionHighlights`.
 */
export type SessionTabParams = {
	date: string;
	mistNetSpeciesList: SpeciesWithEncounters[];
	otherCatchesSpeciesList: SpeciesWithEncounters[];
	netRounds: NetRound[];
	oldestEncounter: SessionEncounter | null;
};

export async function fetchSessionHighlights(
	{ date }: Pick<SessionTabParams, 'date'>,
	viewedGroup: ViewedGroup
): Promise<CombinedHighlight[]> {
	try {
		const newData = await getAllHighlightsAcrossScopes({
			timePeriod: date,
			temporalUnit: 'day',
			viewedGroup
		});
		newData.forEach((v) =>
			console.log(
				`${v.descriptor.type}, ${v.scopes.map((scope) => `${scope.scope.species}, ${scope.scope.parentTimeWindow ? JSON.stringify(scope.scope.parentTimeWindow) : 'all time'}, ${scope.ranking.isTied ? '=' : ''}${scope.ranking.position}`).join(' :: ')}: ${v.value.value}`
			)
		);
	} catch (err) {
		console.log(err);
	}
	return getCondensedHighlightsAtTimePeriod(viewedGroup.id, date, 'day');
}

/**
 * What `page.tsx` prefetches against (#1059). Only the Highlights tab fetches
 * anything of its own — and it is `clientSideOnly`, so `prefetchActiveTabData`
 * deliberately declines to run its fetcher even for a `?tabId=highlights` deep
 * link: highlights are generated in the browser on purpose, for caching and
 * performance reasons, and this page is not the place to quietly reverse that.
 * The tab still opens focused; `TabContent` shows its spinner and fetches on
 * mount.
 *
 * So the list currently prefetches nothing at all, which is the point — it is
 * the page's *declaration* of what each tab's fetch story is, and the wiring
 * is already in place for a future session tab that does want a server-side
 * prefetch.
 */
export const sessionTabPrefetchers: readonly Pick<
	TabConfig<CombinedHighlight[], Pick<SessionTabParams, 'date'>>,
	'id' | 'dataFetcher' | 'clientSideOnly'
>[] = [
	{
		id: 'highlights',
		dataFetcher: fetchSessionHighlights,
		clientSideOnly: true
	}
];
