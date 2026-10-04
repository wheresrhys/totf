'use client';
import { useState } from 'react';
import { TabNav } from '@/app/components/TabNav';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { ConditionalTabPanel } from '@/app/components/shared/ConditionalTabPanel';
import { TabContent } from '@/app/components/shared/TabContent';
import {
	summarySpeciesTotalsTab,
	type SummarySpeciesTotalsData
} from '@/app/components/pages/summary/SummarySpeciesTotalsTab';
import {
	summaryHighlightsTab,
	type SummaryHighlightsData
} from '@/app/components/pages/summary/SummaryHighlightsTab';
import {
	summaryAllTimeMonthTotalsTab,
	type SummaryAllTimeMonthTotalsData
} from '@/app/components/pages/summary/SummaryAllTimeMonthTotalsTab';
import {
	summarySessionTotalsTab,
	type SummarySessionTotalsData
} from '@/app/components/pages/summary/SummarySessionTotalsTab';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	buildGroupSummaryHref,
	buildGroupSessionHref
} from '@/app/lib/group-links';
import {
	filterEmptyMonthTotalsRows,
	formatMonthYearLabel,
	type MonthTotalsRow
} from '@/app/lib/month-totals';
import { EmptyMonthsToggle } from '@/app/components/shared/EmptyMonthsToggle';
import { useLinkableTabs } from '@/app/components/shared/useLinkableTabs';
// Re-exported (not relocated) so this file's other two existing consumers
// (`SquashedMonthSummaryTotalsSection.tsx`, `SpHighlightsTab.tsx`) keep
// working unchanged — see `HighlightsByTimePeriod.tsx`'s doc comment for why
// the implementation itself had to move (breaking a circular import with
// `SummaryHighlightsTab.tsx` below).
export { HighlightsByTimePeriod } from '@/app/components/HighlightsByTimePeriod';
// `MONTH_TOTALS_TAB` (the year page's per-year, linked, toggle-enabled month
// rows) stays eager/inline — distinct from the all-time page's combine-years
// "Month totals" tab, now `summaryAllTimeMonthTotalsTab` below. Same label,
// different semantics: 12 rows summed across every year, encounters-only.
const MONTH_TOTALS_TAB = { id: 'month-totals', label: 'Month totals' };
const YEAR_TOTALS_TAB = { id: 'year-totals', label: 'Year totals' };
// Same tab id/label whichever variant renders (eager, prop-fed, on the month
// page; lazy, `summarySessionTotalsTab`-fetched, on the all-time/year pages)
// — the two are mutually exclusive per page, see `showSessionTotals` below.
const SESSION_TOTALS_TAB = summarySessionTotalsTab;
const SPECIES_TOTALS_TAB = summarySpeciesTotalsTab;
const HIGHLIGHTS_TAB = summaryHighlightsTab;
const ALL_TIME_MONTH_TOTALS_TAB = summaryAllTimeMonthTotalsTab;

// The year summary page's "Month totals" tab content. Extracted from
// `SummaryTotalsSection`'s inline JSX purely so its `hideEmptyMonths` state
// resets on tab remount — `SummaryTotalsSection` itself never unmounts across
// tab switches, so keeping the state up there would persist it for the whole
// page view (same reason `AllTimeMonthTotalsTab` gives for its own state). The
// rows are pre-built and passed in; this component only owns the toggle and
// applies the filter.
function YearMonthTotalsTab({
	monthTotals,
	totalsStats,
	viewedGroup
}: {
	monthTotals: MonthTotalsRow[];
	totalsStats?: CoreStatsResult;
	viewedGroup?: ViewedGroup;
}) {
	const [hideEmptyMonths, setHideEmptyMonths] = useState(true);

	const monthTotalsByTimePeriod = new Map(
		monthTotals.map((row) => [row.stats.time_period, row])
	);
	const visibleRows = filterEmptyMonthTotalsRows(monthTotals, hideEmptyMonths);

	return (
		<PeriodTotalsTable
			timeInterval="month"
			rows={visibleRows.map((row) => row.stats)}
			firstColumnHeader="Month"
			buildHref={(timePeriod) => {
				const row = monthTotalsByTimePeriod.get(timePeriod);
				return buildGroupSummaryHref(
					viewedGroup,
					row && { year: row.year, month: row.zeroIndexedMonth + 1 }
				);
			}}
			buildLabel={(timePeriod) =>
				formatMonthYearLabel(monthTotalsByTimePeriod.get(timePeriod))
			}
			totalsStats={totalsStats}
			extraControls={
				<EmptyMonthsToggle
					value={hideEmptyMonths}
					onChange={setHideEmptyMonths}
				/>
			}
		/>
	);
}

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
	// the 4 migrated tabs, or has no `dataFetcher` output to prefetch.
	initialTabData?: { tabId: string; data: unknown };
}) {
	// Each summary page supplies at most one period tab's data: year totals on
	// the all-time page, month totals on the year page, session totals on the
	// month page (eager) or all-time/year pages (lazy, see below). Whichever is
	// present is prepended and shown first/by default; the day page passes none
	// and keeps Species totals as its sole/default tab.
	const showSessionTotals = viewedGroup !== undefined;
	const tabs = [
		...(yearlyTotals !== undefined ? [YEAR_TOTALS_TAB] : []),
		...(monthTotals ? [MONTH_TOTALS_TAB] : []),
		...(showAllTimeMonthTotals ? [ALL_TIME_MONTH_TOTALS_TAB] : []),
		...(showSessionTotals ? [SESSION_TOTALS_TAB] : []),
		SPECIES_TOTALS_TAB,
		...(viewedGroup !== undefined ? [HIGHLIGHTS_TAB] : [])
	];

	const tabsWithTotalsRow = {
		[YEAR_TOTALS_TAB.id]: true,
		[MONTH_TOTALS_TAB.id]: !yearlyTotals,
		[ALL_TIME_MONTH_TOTALS_TAB.id]: !yearlyTotals,
		[SESSION_TOTALS_TAB.id]: !monthTotals && !yearlyTotals
	};
	// Shared with the species and session pages via `useLinkableTabs` (#818).
	// The 3 untouched tabs (Year/Month totals, eager Session totals) ignore
	// `loadedTabs` and render from `activeTab` alone, same as before; the 4
	// migrated tabs below gate their `ConditionalTabPanel` on it so they mount
	// (and fetch) once, on first selection, and stay mounted-but-hidden
	// thereafter rather than unmounting on every tab switch (#1072).
	const { activeTab, loadedTabs, selectTab } = useLinkableTabs({
		tabIds: tabs.map((tab) => tab.id),
		defaultTabId: tabs[0].id,
		initialTabId
	});

	// The totals row always reflects the page's own aggregate stats, regardless
	// of which tab/table is currently active — `undefined` (not `null`) means
	// "no totals row" to each table's `totalsStats` prop.
	const totalsStats = summaryStats ?? undefined;
	const isSessionActive = activeTab === SESSION_TOTALS_TAB.id;

	return (
		<>
			<TabNav tabs={tabs} activeTab={activeTab} onTabChange={selectTab} />
			{yearlyTotals !== undefined && activeTab === YEAR_TOTALS_TAB.id && (
				<PeriodTotalsTable
					timeInterval="year"
					rows={yearlyTotals}
					firstColumnHeader="Year"
					buildHref={(timePeriod) =>
						buildGroupSummaryHref(viewedGroup, {
							year: new Date(timePeriod).getFullYear()
						})
					}
					totalsStats={
						tabsWithTotalsRow[YEAR_TOTALS_TAB.id] ? totalsStats : undefined
					}
				/>
			)}
			{activeTab === MONTH_TOTALS_TAB.id && monthTotals && (
				<YearMonthTotalsTab
					monthTotals={monthTotals}
					totalsStats={
						tabsWithTotalsRow[MONTH_TOTALS_TAB.id] ? totalsStats : undefined
					}
					viewedGroup={viewedGroup}
				/>
			)}
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId={ALL_TIME_MONTH_TOTALS_TAB.id}
				activeTabId={activeTab}
			>
				<TabContent
					dataFetcher={
						viewedGroup ? ALL_TIME_MONTH_TOTALS_TAB.dataFetcher : undefined
					}
					TabComponent={ALL_TIME_MONTH_TOTALS_TAB.TabComponent}
					params={{
						totalsStats: tabsWithTotalsRow[ALL_TIME_MONTH_TOTALS_TAB.id]
							? totalsStats
							: undefined
					}}
					viewedGroup={viewedGroup!}
					{...(initialTabData?.tabId === ALL_TIME_MONTH_TOTALS_TAB.id
						? {
								initialData:
									initialTabData.data as SummaryAllTimeMonthTotalsData | null
							}
						: {})}
				/>
			</ConditionalTabPanel>
			{showSessionTotals && viewedGroup !== undefined && (
				<>
					{sessionTotals !== undefined ? (
						isSessionActive && (
							<PeriodTotalsTable
								timeInterval="day"
								rows={sessionTotals}
								firstColumnHeader="Session"
								buildHref={(timePeriod) =>
									buildGroupSessionHref(viewedGroup, timePeriod)
								}
								totalsStats={
									tabsWithTotalsRow[SESSION_TOTALS_TAB.id]
										? totalsStats
										: undefined
								}
								showBusiestSession={false}
							/>
						)
					) : (
						<ConditionalTabPanel
							loadedTabs={loadedTabs}
							tabId={SESSION_TOTALS_TAB.id}
							activeTabId={activeTab}
						>
							<TabContent
								dataFetcher={SESSION_TOTALS_TAB.dataFetcher}
								TabComponent={SESSION_TOTALS_TAB.TabComponent}
								params={{
									fromDate,
									toDate,
									totalsStats: tabsWithTotalsRow[SESSION_TOTALS_TAB.id]
										? totalsStats
										: undefined
								}}
								viewedGroup={viewedGroup}
								{...(initialTabData?.tabId === SESSION_TOTALS_TAB.id
									? {
											initialData:
												initialTabData.data as SummarySessionTotalsData | null
										}
									: {})}
							/>
						</ConditionalTabPanel>
					)}
				</>
			)}
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId={SPECIES_TOTALS_TAB.id}
				activeTabId={activeTab}
			>
				<TabContent
					dataFetcher={viewedGroup ? SPECIES_TOTALS_TAB.dataFetcher : undefined}
					TabComponent={SPECIES_TOTALS_TAB.TabComponent}
					params={{ fromDate, toDate, year, month }}
					viewedGroup={viewedGroup!}
					{...(initialTabData?.tabId === SPECIES_TOTALS_TAB.id
						? {
								initialData:
									initialTabData.data as SummarySpeciesTotalsData | null
							}
						: {})}
				/>
			</ConditionalTabPanel>
			{viewedGroup !== undefined && (
				<ConditionalTabPanel
					loadedTabs={loadedTabs}
					tabId={HIGHLIGHTS_TAB.id}
					activeTabId={activeTab}
				>
					<TabContent
						dataFetcher={HIGHLIGHTS_TAB.dataFetcher}
						TabComponent={HIGHLIGHTS_TAB.TabComponent}
						params={{ year, month }}
						viewedGroup={viewedGroup}
						{...(initialTabData?.tabId === HIGHLIGHTS_TAB.id
							? {
									initialData:
										initialTabData.data as SummaryHighlightsData | null
								}
							: {})}
					/>
				</ConditionalTabPanel>
			)}
		</>
	);
}
