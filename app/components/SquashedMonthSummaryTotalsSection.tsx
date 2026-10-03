'use client';
import { TabNav } from '@/app/components/TabNav';
import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { useLinkableTabs } from '@/app/components/shared/useLinkableTabs';
import { CurrentTabProvider } from '@/app/components/shared/CurrentTabContext';
import { getHighlightsWithinTimeWindow } from '@/app/lib/highlights';
import { useLazyTabData } from '@/app/components/shared/useLazyTabData';
import {
	buildGroupSummaryHref,
	buildGroupSessionHref
} from '@/app/lib/group-links';
import {
	formatMonthYearLabel,
	type MonthTotalsRow
} from '@/app/lib/month-totals';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { HighlightsByTimePeriod } from './SummaryTotalsSection';
import { useCallback } from 'react';
// Tab order for the squashed-month summary page (`/summary/jan`, #1005) is
// deliberately Species-first — the opposite of every other summary page's
// tab order — per spec.
const SPECIES_TOTALS_TAB = { id: 'species-totals', label: 'Species totals' };
const YEAR_TOTALS_TAB = { id: 'year-totals', label: 'Year totals' };
const SESSION_TOTALS_TAB = { id: 'session-totals', label: 'Session totals' };
const HIGHLIGHTS_TAB = { id: 'highlights', label: 'Highlights' };

// `fetchPeriodStats(..., 'year', ..., squashedMonth)` returns one row per
// year (bucketed by year, but every column already computed only from that
// year's `squashedMonth` sessions) — reshape into `MonthTotalsRow` so
// `formatMonthYearLabel` can print "January 2026" rather than plain "2026".
function toYearTotalsRows(
	rows: CoreStatsResult[],
	squashedMonth: number
): MonthTotalsRow[] {
	return rows.map((stats) => ({
		year: Number(stats.time_period.slice(0, 4)),
		zeroIndexedMonth: squashedMonth - 1,
		stats
	}));
}

export function SquashedMonthSummaryTotalsSection({
	squashedMonth,
	summaryStats,
	speciesTotalsForMonth,
	yearTotalsForMonth,
	sessionTotalsForMonth,
	viewedGroup,
	initialTabId
}: {
	squashedMonth: number;
	summaryStats?: CoreStatsResult | null;
	speciesTotalsForMonth: SpeciesStatsRow[];
	yearTotalsForMonth: CoreStatsResult[];
	sessionTotalsForMonth: CoreStatsResult[];
	viewedGroup?: ViewedGroup;
	initialTabId?: string;
}) {
	const tabs = [
		SPECIES_TOTALS_TAB,
		YEAR_TOTALS_TAB,
		SESSION_TOTALS_TAB,
		HIGHLIGHTS_TAB
	];
	const { activeTab, selectTab } = useLinkableTabs({
		tabIds: tabs.map((tab) => tab.id),
		defaultTabId: tabs[0].id,
		initialTabId
	});
	const totalsStats = summaryStats ?? undefined;

	const yearTotalsRows = toYearTotalsRows(yearTotalsForMonth, squashedMonth);
	const yearTotalsRowByTimePeriod = new Map(
		yearTotalsRows.map((row) => [row.stats.time_period, row])
	);

	const isHighlightsActive = activeTab === HIGHLIGHTS_TAB.id;
	const fetchHighlightsData = useCallback(
		() =>
			getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: viewedGroup!.id,
				parentTimeWindow: {
					month: squashedMonth
				},
				includePerSpecies: false
			}),
		[viewedGroup, squashedMonth]
	);

	const { data: highlightsData, isLoading: isHighlightsLoading } =
		useLazyTabData(
			isHighlightsActive && viewedGroup !== undefined,
			fetchHighlightsData,
			{
				onError: (error) =>
					console.error('Failed to fetch highlights', {
						viewedGroupId: viewedGroup?.id,
						error
					})
			}
		);

	return (
		<CurrentTabProvider currentTabId={activeTab}>
			<TabNav tabs={tabs} activeTab={activeTab} onTabChange={selectTab} />
			{activeTab === SPECIES_TOTALS_TAB.id && (
				<SpeciesTotalsTable
					speciesStats={speciesTotalsForMonth}
					totalsStats={undefined}
					period={{ squashedMonth }}
				/>
			)}
			{activeTab === YEAR_TOTALS_TAB.id && (
				<PeriodTotalsTable
					timeInterval="year"
					rows={yearTotalsRows.map((row) => row.stats)}
					firstColumnHeader="Year"
					buildHref={(timePeriod) => {
						const row = yearTotalsRowByTimePeriod.get(timePeriod);
						return buildGroupSummaryHref(
							viewedGroup,
							row && { year: row.year, month: squashedMonth }
						);
					}}
					buildLabel={(timePeriod) =>
						formatMonthYearLabel(yearTotalsRowByTimePeriod.get(timePeriod))
					}
					totalsStats={totalsStats}
				/>
			)}
			{activeTab === SESSION_TOTALS_TAB.id && (
				<PeriodTotalsTable
					timeInterval="day"
					rows={sessionTotalsForMonth}
					firstColumnHeader="Session"
					buildHref={(timePeriod) =>
						buildGroupSessionHref(viewedGroup, timePeriod)
					}
					totalsStats={totalsStats}
					showBusiestSession={false}
				/>
			)}
			{isHighlightsActive &&
				(isHighlightsLoading ? (
					<div className="flex items-center justify-center">
						<div className="loading loading-spinner loading-xl"></div>
					</div>
				) : (
					<div>
						{highlightsData && (
							<>
								<HighlightsByTimePeriod
									highlights={highlightsData}
									viewedGroup={viewedGroup}
									heading="Session highlights"
								/>
							</>
						)}
					</div>
				))}
		</CurrentTabProvider>
	);
}
