'use client';
import { TabSet } from '@/app/components/shared/TabSet';
import { squashedMonthSpeciesTotalsTab } from '@/app/components/pages/summary/SquashedMonthSpeciesTotalsTab';
import { squashedMonthYearTotalsTab } from '@/app/components/pages/summary/SquashedMonthYearTotalsTab';
import { squashedMonthSessionTotalsTab } from '@/app/components/pages/summary/SquashedMonthSessionTotalsTab';
import { squashedMonthHighlightsTab } from '@/app/components/pages/summary/SquashedMonthHighlightsTab';
import type { SquashedMonthTabParams } from '@/app/components/pages/summary/squashed-month-tab-params';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';
import type { ViewedGroup } from '@/app/lib/group-slug';

// Tab order for the squashed-month summary page (`/summary/jan`, #1005) is
// deliberately Species-first — the opposite of every other summary page's tab
// order — per spec. `TabSet` takes the first entry as the default tab, so this
// array's order is what makes Species totals the default.
const squashedMonthSummaryTabs = [
	squashedMonthSpeciesTotalsTab,
	squashedMonthYearTotalsTab,
	squashedMonthSessionTotalsTab,
	squashedMonthHighlightsTab
];

export function SquashedMonthSummaryTotalsSection({
	squashedMonth,
	summaryStats,
	speciesTotalsForMonth,
	yearTotalsForMonth,
	sessionTotalsForMonth,
	viewedGroup,
	initialTabId,
	initialTabData
}: {
	squashedMonth: number;
	summaryStats?: CoreStatsResult | null;
	speciesTotalsForMonth: SpeciesStatsRow[];
	yearTotalsForMonth: CoreStatsResult[];
	sessionTotalsForMonth: CoreStatsResult[];
	viewedGroup?: ViewedGroup;
	// The resolved `?tabId=` search param (#804) — wins over the first tab as
	// the initial active tab when it names one of the 4 above; an
	// unknown/garbage value or no param at all falls back to Species totals.
	initialTabId?: string;
	// The active tab's server-prefetched data (#1059's `prefetchActiveTabData`,
	// called by this page's `page.tsx`). Today always `undefined` — see that
	// file's `squashedMonthSummaryTabs` for why.
	initialTabData?: { tabId: string; data: unknown };
}) {
	// The totals row always reflects the page's own aggregate stats, regardless
	// of which tab is active — `undefined` (not `null`) means "no totals row".
	const params: SquashedMonthTabParams = {
		squashedMonth,
		totalsStats: summaryStats ?? undefined,
		speciesTotalsForMonth,
		yearTotalsForMonth,
		sessionTotalsForMonth
	};

	return (
		<TabSet
			tabs={squashedMonthSummaryTabs}
			params={params}
			// Every caller of this component is downstream of `BootstrapPage`,
			// which always resolves a viewed group; the prop stays optional only
			// because `SummaryPageContent` declares it so for its other branch.
			viewedGroup={viewedGroup!}
			initialTabId={initialTabId}
			initialTabData={initialTabData}
		/>
	);
}
