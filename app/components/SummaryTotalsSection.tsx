'use client';
import { useCallback, useState } from 'react';
import { TabNav } from '@/app/components/TabNav';
import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { useLazyTabData } from '@/app/components/shared/useLazyTabData';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import { fetchPeriodStats } from '@/app/actions/summary-stats';
import type { AggregateStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	buildCombinedMonthTotalsRows,
	type MonthTotalsRow
} from '@/app/models/month-totals';

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
	// means "this page has no Session totals tab".
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
}) {
	// Each summary page supplies at most one period tab's data: year totals on
	// the all-time page, month totals on the year page, session totals on the
	// month page. Whichever is present is prepended and shown first/by default;
	// the day page passes none and keeps Species totals as its sole/default tab.
	const showSessionTotals =
		sessionTotals !== undefined && viewedGroup !== undefined;
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
	const combinedMonthRows = combinedMonthStats
		? buildCombinedMonthTotalsRows(combinedMonthStats)
		: [];
	// The month name is precomputed per bucket in the model; look it back up by
	// the row's sentinel `time_period` (there's no year to link to, so no href).
	const combinedMonthLabelByTimePeriod = new Map(
		combinedMonthRows.map((row) => [row.stats.time_period, row.label])
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
					<PeriodTotalsTable
						grouping="month"
						rows={combinedMonthRows.map((row) => row.stats)}
						firstColumnHeader="Month"
						// No single year to drill into — an empty href renders the
						// month label as plain text rather than a link.
						buildHref={() => ''}
						buildLabel={(timePeriod) =>
							combinedMonthLabelByTimePeriod.get(timePeriod) ?? ''
						}
						totalsStats={totalsStats}
						fixedAggregateBy="encounter"
						dashIndividuals
					/>
				))}
			{sessionTotals !== undefined &&
				viewedGroup !== undefined &&
				activeTab === SESSION_TOTALS_TAB.id && (
					<PeriodTotalsTable
						grouping="day"
						rows={sessionTotals}
						firstColumnHeader="Session"
						buildHref={(timePeriod) =>
							`/group/${viewedGroup.slug}/session-temp/${timePeriod}`
						}
						totalsStats={totalsStats}
					/>
				)}
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
