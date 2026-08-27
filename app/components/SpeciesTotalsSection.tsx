'use client';
import { useState } from 'react';
import { TabNav } from '@/app/components/TabNav';
import { SpeciesTotalsTable } from '@/app/components/SpeciesTotalsTable';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import type { AggregateStatsResult } from '@/app/models/db';
import type { MonthTotalsRow } from '@/app/models/month-totals';

const MONTH_TOTALS_TAB = { id: 'month-totals', label: 'Month totals' };
const SPECIES_TOTALS_TAB = { id: 'species-totals', label: 'Species totals' };

export function SpeciesTotalsSection({
	speciesStats,
	monthTotals
}: {
	speciesStats: AggregateStatsResult[];
	// Only the year summary page supplies month totals; when present the
	// "Month totals" tab is prepended and shown first/by default.
	monthTotals?: MonthTotalsRow[];
}) {
	const tabs = monthTotals
		? [MONTH_TOTALS_TAB, SPECIES_TOTALS_TAB]
		: [SPECIES_TOTALS_TAB];
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
