'use client';
import { useCallback } from 'react';
import { fetchSpeciesPeriodTotals } from '../actions/sp-data';
import { PeriodTotalsTable } from './PeriodTotalsTable';
import { useLazyTabData } from './shared/useLazyTabData';
import { buildCombinedMonthTotalsRows } from '@/app/models/month-totals';

// The all-time species page's combine-years "Month totals" tab — the
// species-scoped counterpart to `SummaryTotalsSection`'s
// `ALL_TIME_MONTH_TOTALS_TAB`. Fetches one row per `(year, month)` recorded
// for this species across all history (no date range), then folds them into
// 12 calendar-month buckets via the same cross-year fold `SummaryTotalsSection`
// uses. Encounters-only: summing distinct birds across years would
// double-count a bird retrapped in the same calendar month in a later year.
export function SpCombinedMonthTotalsTab({
	speciesName,
	viewedGroupId,
	isActive
}: {
	speciesName: string;
	viewedGroupId: number;
	// Gates the lazy fetch — true once this tab is the selected tab. Unlike
	// `SpYearTotalsTab`/`SpMonthTotalsTab` (which rely solely on `SpPage`'s
	// `ConditionalTabPanel` deferring their mount), this tab uses #633's
	// `useLazyTabData` explicitly, per this ticket's reuse requirement.
	isActive: boolean;
}) {
	const fetchCombinedMonthStats = useCallback(
		() => fetchSpeciesPeriodTotals(speciesName, viewedGroupId, 'month'),
		[speciesName, viewedGroupId]
	);
	const { data: monthlyStats, isLoading } = useLazyTabData(
		isActive,
		fetchCombinedMonthStats,
		{
			onError: (error) =>
				console.error('Failed to fetch species combined month totals', {
					speciesName,
					viewedGroupId,
					error
				})
		}
	);

	if (isLoading || monthlyStats === undefined) {
		return (
			<div className="flex items-center justify-center">
				<div className="loading loading-spinner loading-xl"></div>
			</div>
		);
	}

	const combinedMonthRows = buildCombinedMonthTotalsRows(monthlyStats);
	// The month name is precomputed per bucket in the model; look it back up by
	// the row's sentinel `time_period` (there's no year to link to, so no href).
	const combinedMonthLabelByTimePeriod = new Map(
		combinedMonthRows.map((row) => [row.stats.time_period, row.label])
	);

	return (
		<PeriodTotalsTable
			grouping="month"
			rows={combinedMonthRows.map((row) => row.stats)}
			firstColumnHeader="Month"
			buildHref={() => ''}
			buildLabel={(timePeriod) =>
				combinedMonthLabelByTimePeriod.get(timePeriod) ?? ''
			}
			aggregationFixedTo="encounter"
			dashIndividuals
		/>
	);
}
