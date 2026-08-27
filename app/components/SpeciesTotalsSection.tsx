'use client';
import { useState } from 'react';
import { TabNav } from '@/app/components/TabNav';
import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import type { AggregateStatsResult } from '@/app/models/db';
import type { MonthTotalsRow } from '@/app/models/month-totals';

const MONTH_TOTALS_TAB = { id: 'month-totals', label: 'Month totals' };
const YEAR_TOTALS_TAB = { id: 'year-totals', label: 'Year totals' };
const SPECIES_TOTALS_TAB = { id: 'species-totals', label: 'Species totals' };

export function SpeciesTotalsSection({
	speciesStats,
	monthTotals,
	yearlyTotals
}: {
	speciesStats: AggregateStatsResult[];
	// Only the year summary page supplies month totals; when present the
	// "Month totals" tab is prepended and shown first/by default.
	monthTotals?: MonthTotalsRow[];
	// Only the all-time summary page fetches this — undefined (not just an
	// empty array) means "this page doesn't have a Year totals tab at all",
	// so /summary/{year} and /summary/{year}/{month} (which don't pass it)
	// keep Species totals as their sole/default tab, matching pre-#571
	// behaviour, until tickets 572/573 add their own analogous tabs here.
	yearlyTotals?: AggregateStatsResult[];
}) {
	// Each summary page supplies at most one period tab's data (year totals on
	// the all-time page, month totals on the year page); whichever is present is
	// prepended and shown first/by default.
	const tabs = [
		...(yearlyTotals !== undefined ? [YEAR_TOTALS_TAB] : []),
		...(monthTotals ? [MONTH_TOTALS_TAB] : []),
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
			{activeTab === YEAR_TOTALS_TAB.id && (
				<PeriodTotalsTable
					grouping="year"
					rows={yearlyTotals ?? []}
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
			{activeTab === SPECIES_TOTALS_TAB.id && (
				<SpeciesTotalsTable speciesStats={speciesStats} />
			)}
		</>
	);
}
