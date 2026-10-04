// The session page's tab wiring that both sides of the server/client boundary
// need: the shared `params` shape every session tab is handed, the Highlights
// tab's `dataFetcher`, and the descriptor list `page.tsx` prefetches against.
//
// Deliberately **not** a `'use client'` module. `SessionTabs.tsx` is (it renders
// `TabSet`), but a server component importing a `'use client'` module only ever
// gets client references back, so `fetchSessionHighlightLines` would be
// uncallable server-side — exactly what the `?tabId=highlights` prefetch needs
// to do. Keeping it directive-free lets it run in both environments: the server
// calls it from `page.tsx`'s `getParams`, and it is bundled into the client
// graph (via `SessionTabs.tsx`) for `TabContent`'s own on-mount fetch.
import { getCondensedHighlightsAtTimePeriod } from '@/app/lib/highlights';
import type { HighlightCategory } from '@/app/lib/highlights/types';
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
 * the rest from `fetchSessionHighlightLines`.
 */
export type SessionTabParams = {
	date: string;
	mistNetSpeciesList: SpeciesWithEncounters[];
	otherCatchesSpeciesList: SpeciesWithEncounters[];
	netRounds: NetRound[];
	oldestEncounter: SessionEncounter | null;
};

/**
 * One already-printed highlight sentence, tagged with the section it belongs
 * to. The highlights pipeline's own `CombinedHighlight` carries its printer as
 * a function property, which cannot cross the server→client boundary — so the
 * fetcher prints each sentence as it goes and hands over this flat, fully
 * serialisable projection instead. That is what makes a server-side prefetch
 * of this tab possible at all.
 */
export type SessionHighlightLine = {
	category: HighlightCategory;
	key: string;
	text: string;
};

export async function fetchSessionHighlightLines(
	{ date }: Pick<SessionTabParams, 'date'>,
	viewedGroup: ViewedGroup
): Promise<SessionHighlightLine[]> {
	const highlights = await getCondensedHighlightsAtTimePeriod(
		viewedGroup.id,
		date,
		'day'
	);
	return highlights.map((highlight) => ({
		category: highlight.descriptor.category,
		key: `${highlight.descriptor.type}-${highlight.species}`,
		text: highlight.formatters.combinedHighlightPrinter(highlight)
	}));
}

/**
 * What `page.tsx` prefetches against (#1059). Only the Highlights tab fetches
 * anything of its own, so it is the only entry: `prefetchActiveTabData`
 * returns `undefined` for an id it can't find, which is precisely the right
 * answer for the three tabs whose data already arrived with the page.
 */
export const sessionTabPrefetchers: readonly Pick<
	TabConfig<SessionHighlightLine[], Pick<SessionTabParams, 'date'>>,
	'id' | 'dataFetcher'
>[] = [{ id: 'highlights', dataFetcher: fetchSessionHighlightLines }];
