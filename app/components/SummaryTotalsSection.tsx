'use client';
import { TabSet } from '@/app/components/shared/TabSet';
import type { TabConfig } from '@/app/components/shared/TabContent';
import { summarySpeciesTotalsTab } from '@/app/components/pages/summary/SummarySpeciesTotalsTab';
import { summaryHighlightsTab } from '@/app/components/pages/summary/SummaryHighlightsTab';
import { summaryAllTimeMonthTotalsTab } from '@/app/components/pages/summary/SummaryAllTimeMonthTotalsTab';
import { summarySessionTotalsTab } from '@/app/components/pages/summary/SummarySessionTotalsTab';
import { summaryYearTotalsTab } from '@/app/components/pages/summary/SummaryYearTotalsTab';
import { summaryMonthTotalsTab } from '@/app/components/pages/summary/SummaryMonthTotalsTab';
import { summaryEagerSessionTotalsTab } from '@/app/components/pages/summary/SummaryEagerSessionTotalsTab';
import type { SummaryTabParams } from '@/app/components/pages/summary/summary-tab-params';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { MonthTotalsRow } from '@/app/lib/month-totals';
// Re-exported (not relocated) so this file's other two existing consumers
// (`SquashedMonthSummaryTotalsSection.tsx`, `SpHighlightsTab.tsx`) keep
// working unchanged — see `HighlightsByTimePeriod.tsx`'s doc comment for why
// the implementation itself had to move (breaking a circular import with
// `SummaryHighlightsTab.tsx` below).
export { HighlightsByTimePeriod } from '@/app/components/HighlightsByTimePeriod';

export function SummaryTotalsSection({
	summaryStats,
	monthTotals,
	yearlyTotals,
	sessionTotals,
	showAllTimeMonthTotals,
	viewedGroup,
	fromDate,
	toDate,
	year,
	month,
	initialTabId,
	initialTabData
}: {
	// The page's aggregate stats for whichever table/tab is active — used to
	// derive the pinned totals row. `null` (no data yet) renders no totals row.
	summaryStats?: CoreStatsResult | null;
	// Only the year summary page supplies month totals; when present the
	// "Month totals" tab is prepended and shown first/by default.
	monthTotals?: MonthTotalsRow[];
	// Only the all-time summary page fetches this — undefined (not just an
	// empty array) means "this page doesn't have a Year totals tab at all",
	// so pages that don't pass it keep Species totals as their sole/default tab.
	yearlyTotals?: CoreStatsResult[];
	// The month summary page passes these — a leading "Session totals" tab needs
	// both the per-day rows and a group to build session links for. undefined
	// means "this page has no Session totals tab"
	sessionTotals?: CoreStatsResult[];
	// Only the all-time page sets this — it enables the combine-years "Month
	// totals" tab, whose data (unlike the year page's `monthTotals` prop) is
	// fetched lazily on first selection rather than passed in, so this is just a
	// boolean gate, not the data itself.
	showAllTimeMonthTotals?: boolean;
	// The viewed group whose id scopes the lazy Species-totals fetch. All three
	// summary pages supply it; the Session totals tab additionally needs it to
	// build session links.
	viewedGroup?: ViewedGroup;
	// The date range the Species-totals fetch is scoped to — matches the bounds
	// the page used for its other stats. Both undefined on the all-time page
	// (unscoped, all-time species totals).
	fromDate?: string;
	toDate?: string;
	// The page's own period, mirroring `SummaryPage`'s `year`/`month` props —
	// threaded into `SpeciesTotalsTable` so its species links carry the same
	// period into the target `/species/{name}[/{year}[/{month}]]` URL (#625).
	// Undefined on the all-time page, matching its unscoped species links.
	year?: number;
	month?: number;
	// The resolved `?tabId=` search param (#804, reusing #803's mechanism) —
	// wins over `tabs[0].id` as the initial active tab when it names one of
	// this render's own `tabs`; an unknown/garbage value or no param at all
	// falls back to `tabs[0].id` unchanged.
	initialTabId?: string;
	// The one migrated tab's server-prefetched data, matching `initialTabId`
	// (#1072's `prefetchActiveTabData` wiring, one route-depth-specific caller
	// per `page.tsx`) — `undefined` when the resolved initial tab isn't one of
	// the migrated tabs, or has no `dataFetcher` output to prefetch.
	initialTabData?: { tabId: string; data: unknown };
}) {
	// Each summary page supplies at most one period tab's data: year totals on
	// the all-time page, month totals on the year page, session totals on the
	// month page (eager) or all-time/year pages (lazy, see below). Whichever is
	// present is prepended and shown first/by default; the day page passes none
	// and keeps Species totals as its sole/default tab.
	const showSessionTotals = viewedGroup !== undefined;

	// The totals row always reflects the page's own aggregate stats, regardless
	// of which tab/table is currently active — `undefined` (not `null`) means
	// "no totals row" to each table's `totalsStats` prop.
	const totalsStats = summaryStats ?? undefined;

	// Which tabs get a pinned totals row — carried over unchanged from the
	// pre-#1067 behaviour. Looked up by each prop-fed tab's own `TabComponent`
	// (off the shared `params` below) and overridden per-tab for the 4
	// migrated tabs, same as #1072 left it.
	const tabsWithTotalsRow: Record<string, boolean> = {
		[summaryYearTotalsTab.id]: true,
		[summaryMonthTotalsTab.id]: !yearlyTotals,
		[summaryAllTimeMonthTotalsTab.id]: !yearlyTotals,
		[summarySessionTotalsTab.id]: !monthTotals && !yearlyTotals
	};

	// The single combined params object every tab in this page's `TabSet` is
	// handed (#1067) — each `TabComponent`/`dataFetcher` reads only the fields
	// it actually needs off this and ignores the rest, extending the
	// `SummaryTabParams` shape #1072 already built for its 4 migrated tabs.
	const params: SummaryTabParams = {
		fromDate,
		toDate,
		year,
		month,
		totalsStats,
		yearlyTotals,
		monthTotals,
		sessionTotals,
		tabsWithTotalsRow
	};

	// All 7 possible tabs, conditionally included exactly as before (#1072's
	// 4 plus this ticket's 3) — only the mechanism that renders/gates each tab
	// changed, not which tabs appear. Every entry shares the one
	// `SummaryTabParams` shape above, so each is cast to `TabConfig<unknown,
	// SummaryTabParams>` to erase its own concrete `DataType` — required
	// because `TabComponent` is contravariant in its `data` parameter, so a
	// `TabConfig<Specific, P>` doesn't structurally widen to
	// `TabConfig<unknown, P>` on its own.
	const tabs: TabConfig<unknown, SummaryTabParams>[] = [
		...(yearlyTotals !== undefined
			? [summaryYearTotalsTab as TabConfig<unknown, SummaryTabParams>]
			: []),
		...(monthTotals
			? [summaryMonthTotalsTab as TabConfig<unknown, SummaryTabParams>]
			: []),
		...(showAllTimeMonthTotals
			? [
					{
						...summaryAllTimeMonthTotalsTab,
						dataFetcher: viewedGroup
							? summaryAllTimeMonthTotalsTab.dataFetcher
							: undefined
					} as TabConfig<unknown, SummaryTabParams>
				]
			: []),
		...(showSessionTotals
			? [
					(sessionTotals !== undefined
						? summaryEagerSessionTotalsTab
						: summarySessionTotalsTab) as TabConfig<unknown, SummaryTabParams>
				]
			: []),
		{
			...summarySpeciesTotalsTab,
			dataFetcher: viewedGroup ? summarySpeciesTotalsTab.dataFetcher : undefined
		} as TabConfig<unknown, SummaryTabParams>,
		...(viewedGroup !== undefined
			? [summaryHighlightsTab as TabConfig<unknown, SummaryTabParams>]
			: [])
	];

	return (
		<TabSet<SummaryTabParams, SummaryTabParams[]>
			tabs={tabs}
			params={params}
			viewedGroup={viewedGroup!}
			initialTabId={initialTabId}
			initialTabData={initialTabData}
		/>
	);
}
