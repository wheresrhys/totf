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
	buildCombinedMonthTotalsRows,
	buildPerYearMonthTotalsRows,
	type MonthTotalsRow
} from '@/app/models/month-totals';
import { CombineYearsToggle } from '@/app/components/shared/CombineYearsToggle';

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
	totalsStats
}: {
	periodStats: AggregateStatsResult[];
	totalsStats?: AggregateStatsResult;
}) {
	const [combineYears, setCombineYears] = useState(true);

	// ON: 12 calendar-month buckets summed across every year. The month name
	// is precomputed per bucket in the model; look it back up by the row's
	// sentinel `time_period` (there's no year to link to, so no href).
	const combinedRows = buildCombinedMonthTotalsRows(periodStats);
	const combinedLabelByTimePeriod = new Map(
		combinedRows.map((row) => [row.stats.time_period, row.label])
	);

	// OFF: one row per real `(year, month)` combination, unsummed. Label/href
	// are precomputed per row in the model; look them back up by `time_period`
	// so the shared table renders those rather than re-deriving from the date
	// string.
	const perYearRows = buildPerYearMonthTotalsRows(periodStats);
	const perYearRowByTimePeriod = new Map(
		perYearRows.map((row) => [row.stats.time_period, row])
	);

	return (
		<>
			<div className="mb-2">
				<CombineYearsToggle value={combineYears} onChange={setCombineYears} />
			</div>
			{combineYears ? (
				<PeriodTotalsTable
					grouping="month"
					rows={combinedRows.map((row) => row.stats)}
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
				/>
			) : (
				<PeriodTotalsTable
					grouping="month"
					rows={perYearRows.map((row) => row.stats)}
					firstColumnHeader="Month"
					buildHref={(timePeriod) =>
						perYearRowByTimePeriod.get(timePeriod)?.href ?? ''
					}
					buildLabel={(timePeriod) =>
						perYearRowByTimePeriod.get(timePeriod)?.label ?? ''
					}
					totalsStats={totalsStats}
				/>
			)}
		</>
	);
}

export function SummaryTotalsSection({
	summaryStats,
	monthTotals,
	yearlyTotals,
	sessionTotals,
	showAllTimeMonthTotals,
	lazySessionTotals,
	viewedGroup,
	fromDate,
	toDate,
	year,
	month
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
	// means "this page has no Session totals tab" (unless `lazySessionTotals` is
	// set, see below).
	sessionTotals?: AggregateStatsResult[];
	// Only the all-time page sets this — it enables the combine-years "Month
	// totals" tab, whose data (unlike the year page's `monthTotals` prop) is
	// fetched lazily on first selection rather than passed in, so this is just a
	// boolean gate, not the data itself.
	showAllTimeMonthTotals?: boolean;
	// The all-time and year summary pages set this instead of supplying
	// `sessionTotals` up front — it shows the Session totals tab but defers the
	// `fetchPeriodTotals('day', fromDate, toDate)` call (scoped by the same
	// `fromDate`/`toDate` used for Species totals) until the tab is first
	// selected, via the same `useLazyTabData` mechanism as Species totals. The
	// month summary page keeps fetching eagerly server-side and passing
	// `sessionTotals` directly — untouched by this.
	lazySessionTotals?: boolean;
	// The viewed group whose id scopes the lazy Species-totals fetch. All three
	// summary pages supply it; the Session totals tab additionally needs it to
	// build session links (and to scope its own lazy fetch when
	// `lazySessionTotals` is set).
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
}) {
	// Each summary page supplies at most one period tab's data: year totals on
	// the all-time page, month totals on the year page, session totals on the
	// month page (eager) or all-time/year pages (lazy, see below). Whichever is
	// present is prepended and shown first/by default; the day page passes none
	// and keeps Species totals as its sole/default tab.
	const showSessionTotals =
		(sessionTotals !== undefined || lazySessionTotals === true) &&
		viewedGroup !== undefined;
	const tabs = [
		...(yearlyTotals !== undefined ? [YEAR_TOTALS_TAB] : []),
		...(monthTotals ? [MONTH_TOTALS_TAB] : []),
		...(showAllTimeMonthTotals ? [ALL_TIME_MONTH_TOTALS_TAB] : []),
		...(showSessionTotals ? [SESSION_TOTALS_TAB] : []),
		SPECIES_TOTALS_TAB
	];
	const [activeTab, setActiveTab] = useState(tabs[0].id);

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

	// Session totals follow the same fetch-on-select shape as Species totals,
	// but only when the page opted in via `lazySessionTotals` — when
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
				lazySessionTotals === true &&
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
	// Label/href are precomputed per month in the model (timezone-safe); look
	// them back up by `time_period` so the shared table renders those rather
	// than re-deriving from the date string.
	const monthTotalsByTimePeriod = new Map(
		(monthTotals ?? []).map((row) => [row.stats.time_period, row])
	);

	// The totals row always reflects the page's own aggregate stats, regardless
	// of which tab/table is currently active — `undefined` (not `null`) means
	// "no totals row" to each table's `totalsStats` prop.
	const totalsStats = summaryStats ?? undefined;

	return (
		<>
			<TabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
			{yearlyTotals !== undefined && activeTab === YEAR_TOTALS_TAB.id && (
				<PeriodTotalsTable
					grouping="year"
					rows={yearlyTotals}
					firstColumnHeader="Year"
					buildHref={(timePeriod) =>
						`/summary/${new Date(timePeriod).getFullYear()}`
					}
					totalsStats={totalsStats}
				/>
			)}
			{activeTab === MONTH_TOTALS_TAB.id && monthTotals && (
				<PeriodTotalsTable
					grouping="month"
					rows={monthTotals.map((row) => row.stats)}
					firstColumnHeader="Month"
					buildHref={(timePeriod) =>
						monthTotalsByTimePeriod.get(timePeriod)?.href ?? ''
					}
					buildLabel={(timePeriod) =>
						monthTotalsByTimePeriod.get(timePeriod)?.label ?? ''
					}
					totalsStats={totalsStats}
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
						totalsStats={totalsStats}
					/>
				))}
			{showSessionTotals &&
				viewedGroup !== undefined &&
				isSessionActive &&
				(sessionTotals !== undefined ? (
					<PeriodTotalsTable
						grouping="day"
						rows={sessionTotals}
						firstColumnHeader="Session"
						buildHref={(timePeriod) =>
							`/group/${viewedGroup.slug}/session-temp/${timePeriod}`
						}
						totalsStats={totalsStats}
					/>
				) : isSessionLoading ? (
					<div className="flex items-center justify-center">
						<div className="loading loading-spinner loading-xl"></div>
					</div>
				) : (
					<PeriodTotalsTable
						grouping="day"
						rows={lazySessionStats ?? []}
						firstColumnHeader="Session"
						buildHref={(timePeriod) =>
							`/group/${viewedGroup.slug}/session-temp/${timePeriod}`
						}
						totalsStats={totalsStats}
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
						totalsStats={totalsStats}
						period={year === undefined ? undefined : { year, month }}
					/>
				))}
		</>
	);
}
