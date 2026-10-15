'use client';

// Imported from its own file rather than from `SummaryTotalsSection.tsx`
// (which only re-exports it) — see `HighlightsByTimePeriod.tsx`'s doc comment.
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	SQUASHED_MONTH_HIGHLIGHTS_TAB_ID,
	type SquashedMonthTabParams
} from './squashed-month-tab-params';

async function fetchSquashedMonthHighlights(
	params: SquashedMonthTabParams,
	viewedGroup: ViewedGroup
) {
	return [];
}

// Exported so a call site can cast a `TabContent`/`prefetchActiveTabData`
// `unknown` payload back to this tab's concrete shape without reaching for
// `as unknown as` (#921).
export type SquashedMonthHighlightsData = Awaited<
	ReturnType<typeof fetchSquashedMonthHighlights>
>;

// `TabConfig<unknown, …>` rather than `TabConfig<SquashedMonthHighlightsData,
// …>`: `TabSet` types every entry in its `tabs` array as `TabConfig<unknown,
// OwnParamsType>`, and a `TabComponent` declaring a narrower `data` parameter
// isn't assignable to one accepting `unknown`. The cast below is the one place
// that narrowing happens instead.
export const squashedMonthHighlightsTab: TabConfig<
	unknown,
	SquashedMonthTabParams
> = {
	id: SQUASHED_MONTH_HIGHLIGHTS_TAB_ID,
	label: 'Highlights',
	dataFetcher: fetchSquashedMonthHighlights,
	// Highlights are generated client-side on purpose (#1089), and a
	// `CombinedHighlight` carries its printers as function properties, so a
	// server-prefetched payload could never cross the boundary back into this
	// client component anyway. See `summary-tab-prefetchers.ts` (#1096).
	clientSideOnly: true,
	TabComponent: ({ data, viewedGroup }) => <div>Work in progress</div>
};
