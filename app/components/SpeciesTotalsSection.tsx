'use client';
import { useState } from 'react';
import { TabNav } from '@/app/components/TabNav';
import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import type { AggregateStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/lib/group-slug';
import type { MonthTotalsRow } from '@/app/models/month-totals';

const MONTH_TOTALS_TAB = { id: 'month-totals', label: 'Month totals' };
const YEAR_TOTALS_TAB = { id: 'year-totals', label: 'Year totals' };
const SESSION_TOTALS_TAB = { id: 'session-totals', label: 'Session totals' };
const SPECIES_TOTALS_TAB = { id: 'species-totals', label: 'Species totals' };

export function SpeciesTotalsSection({
	speciesStats,
	monthTotals,
	yearlyTotals,
	sessionTotals,
	viewedGroup
}: {
	speciesStats: AggregateStatsResult[];
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
	viewedGroup?: ViewedGroup;
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
		...(showSessionTotals ? [SESSION_TOTALS_TAB] : []),
		SPECIES_TOTALS_TAB
	];
	const [activeTab, setActiveTab] = useState(tabs[0].id);

	// Label/href are precomputed per month in the model (timezone-safe); look
	// them back up by `time_period` so the shared table renders those rather
	// than re-deriving from the date string.
	const monthTotalsByTimePeriod = new Map(
		(monthTotals ?? []).map((row) => [row.stats.time_period, row])
	);

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
				/>
			)}
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
					/>
				)}
			{activeTab === SPECIES_TOTALS_TAB.id && (
				<SpeciesTotalsTable speciesStats={speciesStats} />
			)}
		</>
	);
}
