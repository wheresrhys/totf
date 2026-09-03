'use client';
import { useCallback, useState } from 'react';
import { fetchSpeciesPeriodTotals } from '@/app/actions/sp-data';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { useLazyTabData } from '@/app/components/shared/useLazyTabData';
import {
	buildCombinedMonthTotalsRows,
	buildPerYearMonthTotalsRows
} from '@/app/models/month-totals';
import { CombineYearsToggle } from '@/app/components/shared/CombineYearsToggle';

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
	// `SpYearTotalsTab`/`SpMonthTotalsTab` (which rely solely on
	// `SpeciesPageContent`'s `ConditionalTabPanel` deferring their mount), this
	// tab uses #633's
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
	// Defaults to ON (combined) — resets each time this tab remounts, mirroring
	// `SummaryTotalsSection`'s `AllTimeMonthTotalsTab`, since this component
	// itself never unmounts across tab switches (`SpeciesPageContent`'s tab nav
	// keeps it mounted via `isActive`).
	const [combineYears, setCombineYears] = useState(true);

	if (isLoading || monthlyStats === undefined) {
		return (
			<div className="flex items-center justify-center">
				<div className="loading loading-spinner loading-xl"></div>
			</div>
		);
	}

	// ON: 12 calendar-month buckets summed across every year, encounters-only —
	// unchanged from #637. The month name is precomputed per bucket in the
	// model; look it back up by the row's sentinel `time_period` (there's no
	// year to link to, so no href).
	const combinedMonthRows = buildCombinedMonthTotalsRows(monthlyStats);
	const combinedMonthLabelByTimePeriod = new Map(
		combinedMonthRows.map((row) => [row.stats.time_period, row.label])
	);

	// OFF: one row per real `(year, month)` combination the species actually has
	// data for — no zero-filling, no summing across years — linking into the
	// species' year/month drill-down route, same shape `SpMonthTotalsTab` uses.
	const perYearRows = buildPerYearMonthTotalsRows(
		monthlyStats,
		(year, month) => `/species/${speciesName}/${year}/${month}`
	);
	const perYearRowByTimePeriod = new Map(
		perYearRows.map((row) => [row.stats.time_period, row])
	);

	return (
		<>
			{combineYears ? (
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
					extraControls={
						<CombineYearsToggle
							value={combineYears}
							onChange={setCombineYears}
						/>
					}
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
					extraControls={
						<CombineYearsToggle
							value={combineYears}
							onChange={setCombineYears}
						/>
					}
				/>
			)}
		</>
	);
}
