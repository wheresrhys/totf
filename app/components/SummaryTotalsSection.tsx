'use client';
import { useCallback, useState } from 'react';
import { TabNav } from '@/app/components/TabNav';
import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { useLazyTabData } from '@/app/components/shared/useLazyTabData';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import { fetchPeriodStats } from '@/app/actions/summary-stats';
import { fetchPeriodTotals } from '@/app/actions/period-totals';
import type { AggregateStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	buildGroupSummaryHref,
	buildGroupSessionHref
} from '@/lib/group-links';
import {
	buildCombinedMonthTotalsRows,
	buildPerYearMonthTotalsRows,
	filterEmptyMonthTotalsRows,
	formatMonthYearLabel,
	formatMonthLabel,
	type MonthTotalsRow
} from '@/app/models/month-totals';
import { CombineYearsToggle } from '@/app/components/shared/CombineYearsToggle';
import { EmptyMonthsToggle } from '@/app/components/shared/EmptyMonthsToggle';
import { useLinkableTabs } from '@/app/components/shared/useLinkableTabs';

const MONTH_TOTALS_TAB = { id: 'month-totals', label: 'Month totals' };
// The all-time page's combine-years month tab — distinct from `MONTH_TOTALS_TAB`
// (the year page's per-year, linked, toggle-enabled month rows). Same label,
// different semantics: 12 rows summed across every year, encounters-only.
const ALL_TIME_MONTH_TOTALS_TAB = {
	id: 'all-time-month-totals',
	label: 'Month totals'
};
const YEAR_TOTALS_TAB = { id: 'year-totals', label: 'Year totals' };
const SESSION_TOTALS_TAB = { id: 'session-totals', label: 'Session totals' };
const SPECIES_TOTALS_TAB = { id: 'species-totals', label: 'Species totals' };

// The all-time page's combine-years "Month totals" tab content. Owns the
// "Combine years" toggle's local state so it resets to the default (ON) each
// time the tab remounts — mirroring how `PeriodTotalsTable`'s own
// `aggregateByState` resets per #604 — since `SummaryTotalsSection` itself
// never unmounts across tab switches, so the state has to live down here
// instead. Both row shapes are derived from the same already-fetched
// `periodStats` array (the raw per-`(year, month)` rows `aggregate_stats`
// returns) — toggling re-renders in place, no new fetch either way.
function AllTimeMonthTotalsTab({
	periodStats,
	totalsStats,
	viewedGroup
}: {
	periodStats: AggregateStatsResult[];
	totalsStats?: AggregateStatsResult;
	viewedGroup?: ViewedGroup;
}) {
	const [combineYears, setCombineYears] = useState(true);
	// Sibling of `combineYears` — independent state, applies to whichever view is
	// shown, and resets to Hide (`true`) on tab remount alongside it.
	const [hideEmptyMonths, setHideEmptyMonths] = useState(true);

	// ON: 12 calendar-month buckets summed across every year. Look each row
	// back up by its sentinel `time_period` (there's no year to link to, so no
	// href) and format its label on demand.
	const combinedRows = buildCombinedMonthTotalsRows(periodStats);
	const combinedLabelByTimePeriod = new Map(
		combinedRows.map((row) => [row.stats.time_period, formatMonthLabel(row)])
	);

	// OFF: one row per real `(year, month)` combination, unsummed. Look each
	// row back up by `time_period` so the shared table can derive its
	// label/href from the raw row rather than re-deriving from the date string.
	const perYearRows = buildPerYearMonthTotalsRows(periodStats);
	const perYearRowByTimePeriod = new Map(
		perYearRows.map((row) => [row.stats.time_period, row])
	);

	const extraControls = (
		<>
			<CombineYearsToggle value={combineYears} onChange={setCombineYears} />
			<EmptyMonthsToggle
				value={hideEmptyMonths}
				onChange={setHideEmptyMonths}
			/>
		</>
	);

	return (
		<>
			{combineYears ? (
				<PeriodTotalsTable
					timeInterval="month"
					rows={filterEmptyMonthTotalsRows(combinedRows, hideEmptyMonths).map(
						(row) => row.stats
					)}
					firstColumnHeader="Month"
					// No single year to drill into — an empty href renders the
					// month label as plain text rather than a link.
					buildHref={() => ''}
					buildLabel={(timePeriod) =>
						combinedLabelByTimePeriod.get(timePeriod) ?? ''
					}
					totalsStats={totalsStats}
					aggregationFixedTo="encounter"
					dashIndividuals
					extraControls={extraControls}
				/>
			) : (
				<PeriodTotalsTable
					timeInterval="month"
					rows={filterEmptyMonthTotalsRows(perYearRows, hideEmptyMonths).map(
						(row) => row.stats
					)}
					firstColumnHeader="Month"
					buildHref={(timePeriod) => {
						const row = perYearRowByTimePeriod.get(timePeriod);
						return buildGroupSummaryHref(
							viewedGroup,
							row && { year: row.year, month: row.zeroIndexedMonth + 1 }
						);
					}}
					buildLabel={(timePeriod) =>
						formatMonthYearLabel(perYearRowByTimePeriod.get(timePeriod))
					}
					totalsStats={totalsStats}
					extraControls={extraControls}
				/>
			)}
		</>
	);
}

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
	totalsStats?: AggregateStatsResult;
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
	initialTabId
}: {
	// The page's aggregate stats for whichever table/tab is active — used to
	// derive the pinned totals row. `null` (no data yet) renders no totals row.
	summaryStats?: AggregateStatsResult | null;
	// Only the year summary page supplies month totals; when present the
	// "Month totals" tab is prepended and shown first/by default.
	monthTotals?: MonthTotalsRow[];
	// Only the all-time summary page fetches this — undefined (not just an
	// empty array) means "this page doesn't have a Year totals tab at all",
	// so pages that don't pass it keep Species totals as their sole/default tab.
	yearlyTotals?: AggregateStatsResult[];
	// The month summary page passes these — a leading "Session totals" tab needs
	// both the per-day rows and a group to build session links for. undefined
	// means "this page has no Session totals tab"
	sessionTotals?: AggregateStatsResult[];
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
		SPECIES_TOTALS_TAB
	];

	const tabsWithTotalsRow = {
		[YEAR_TOTALS_TAB.id]: true,
		[MONTH_TOTALS_TAB.id]: !yearlyTotals,
		[ALL_TIME_MONTH_TOTALS_TAB.id]: !yearlyTotals,
		[SESSION_TOTALS_TAB.id]: !monthTotals && !yearlyTotals
	};
	// Shared with the species and session pages via `useLinkableTabs` (#818).
	// Summary renders every tab eagerly, so it ignores the hook's `loadedTabs`
	// and just uses `activeTab` + `selectTab`.
	const { activeTab, selectTab } = useLinkableTabs({
		tabIds: tabs.map((tab) => tab.id),
		defaultTabId: tabs[0].id,
		initialTabId
	});

	// Species totals are fetched lazily: only once the Species tab is first
	// selected (or on first paint when it is the sole/default tab), and never
	// again for the component's mounted lifetime — the page no longer eagerly
	// fetches this data server-side.
	const isSpeciesActive = activeTab === SPECIES_TOTALS_TAB.id;
	const fetchSpeciesStats = useCallback(
		() => fetchSpeciesData(viewedGroup!.id, fromDate, toDate),
		[viewedGroup, fromDate, toDate]
	);
	const { data: speciesStats, isLoading: isSpeciesLoading } = useLazyTabData(
		isSpeciesActive && viewedGroup !== undefined,
		fetchSpeciesStats,
		{
			onError: (error) =>
				console.error('Failed to fetch species totals', {
					viewedGroupId: viewedGroup?.id,
					fromDate,
					toDate,
					error
				})
		}
	);

	// The all-time combine-years month tab fetches lazily too, on first select —
	// one row per (year, month) across the group's full history, folded into 12
	// calendar-month buckets client-side. Encounters-only, so it needs no date
	// range (all-time) and no per-year drill-down link.
	const isAllTimeMonthActive = activeTab === ALL_TIME_MONTH_TOTALS_TAB.id;
	const fetchCombinedMonthStats = useCallback(
		() => fetchPeriodStats(viewedGroup!.id, 'month'),
		[viewedGroup]
	);
	const { data: combinedMonthStats, isLoading: isCombinedMonthLoading } =
		useLazyTabData(
			isAllTimeMonthActive && viewedGroup !== undefined,
			fetchCombinedMonthStats,
			{
				onError: (error) =>
					console.error('Failed to fetch all-time month totals', {
						viewedGroupId: viewedGroup?.id,
						error
					})
			}
		);

	// Session totals follow the same fetch-on-select shape as Species totals. When
	// `sessionTotals` is already supplied (the month page's eager fetch) this
	// never fires, since `isActive` below is gated on `sessionTotals` being
	// undefined.
	const isSessionActive = activeTab === SESSION_TOTALS_TAB.id;
	const fetchSessionStats = useCallback(
		() => fetchPeriodTotals(viewedGroup!.id, 'day', fromDate, toDate),
		[viewedGroup, fromDate, toDate]
	);
	const { data: lazySessionStats, isLoading: isSessionLoading } =
		useLazyTabData(
			isSessionActive &&
				sessionTotals === undefined &&
				viewedGroup !== undefined,
			fetchSessionStats,
			{
				onError: (error) =>
					console.error('Failed to fetch session totals', {
						viewedGroupId: viewedGroup?.id,
						fromDate,
						toDate,
						error
					})
			}
		);
	// The totals row always reflects the page's own aggregate stats, regardless
	// of which tab/table is currently active — `undefined` (not `null`) means
	// "no totals row" to each table's `totalsStats` prop.
	const totalsStats = summaryStats ?? undefined;

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
			{isAllTimeMonthActive &&
				(isCombinedMonthLoading ? (
					<div className="flex items-center justify-center">
						<div className="loading loading-spinner loading-xl"></div>
					</div>
				) : (
					<AllTimeMonthTotalsTab
						periodStats={combinedMonthStats ?? []}
						totalsStats={
							tabsWithTotalsRow[ALL_TIME_MONTH_TOTALS_TAB.id]
								? totalsStats
								: undefined
						}
						viewedGroup={viewedGroup}
					/>
				))}
			{showSessionTotals &&
				viewedGroup !== undefined &&
				isSessionActive &&
				(sessionTotals !== undefined ? (
					<PeriodTotalsTable
						timeInterval="day"
						rows={sessionTotals}
						firstColumnHeader="Session"
						buildHref={(timePeriod) =>
							buildGroupSessionHref(viewedGroup, timePeriod)
						}
						totalsStats={
							tabsWithTotalsRow[SESSION_TOTALS_TAB.id] ? totalsStats : undefined
						}
					/>
				) : isSessionLoading ? (
					<div className="flex items-center justify-center">
						<div className="loading loading-spinner loading-xl"></div>
					</div>
				) : (
					<PeriodTotalsTable
						timeInterval="day"
						rows={lazySessionStats ?? []}
						firstColumnHeader="Session"
						buildHref={(timePeriod) =>
							buildGroupSessionHref(viewedGroup, timePeriod)
						}
						totalsStats={
							tabsWithTotalsRow[SESSION_TOTALS_TAB.id] ? totalsStats : undefined
						}
					/>
				))}
			{isSpeciesActive &&
				(isSpeciesLoading ? (
					<div className="flex items-center justify-center">
						<div className="loading loading-spinner loading-xl"></div>
					</div>
				) : (
					<SpeciesTotalsTable
						speciesStats={speciesStats ?? []}
						totalsStats={undefined}
						period={year === undefined ? undefined : { year, month }}
					/>
				))}
		</>
	);
}
