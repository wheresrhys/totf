'use client';
import { useCallback, useState } from 'react';
import {
	fetchSpeciesPeriodTotals,
	fetchSpeciesCombinedMonthTotals
} from '@/app/actions/sp-data';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { useLazyTabData } from '@/app/components/shared/useLazyTabData';
import {
	buildCombinedMonthTotalsRows,
	buildPerYearMonthTotalsRows,
	filterEmptyMonthTotalsRows,
	formatMonthYearLabel,
	formatMonthLabel
} from '@/app/lib/month-totals';
import { CombineYearsToggle } from '@/app/components/shared/CombineYearsToggle';
import { EmptyMonthsToggle } from '@/app/components/shared/EmptyMonthsToggle';

// The all-time species page's combine-years "Month totals" tab — the
// species-scoped counterpart to `SummaryTotalsSection`'s
// `ALL_TIME_MONTH_TOTALS_TAB`. Fetches both the raw per-`(year, month)` rows
// (for "Combine years OFF") and the true cross-year aggregate per calendar
// month via `core_stats`' `'month-squashed'` mode (#996, for "ON") — the same
// two-fetch shape `SummaryTotalsSection` uses.
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
	// The "Combine years OFF" view needs the raw per-(year, month) rows; the
	// "ON" view needs the true cross-year aggregate per calendar month, fetched
	// separately via `core_stats`' `'month-squashed'` mode (#996) rather than
	// folded client-side from the per-year rows (that would double-count any
	// distinct-count column, e.g. `bird_count`, for a bird retrapped in the same
	// calendar month in more than one year).
	const fetchCombinedMonthStats = useCallback(async () => {
		const [monthlyStats, monthSquashedStats] = await Promise.all([
			fetchSpeciesPeriodTotals(speciesName, viewedGroupId, 'month'),
			fetchSpeciesCombinedMonthTotals(speciesName, viewedGroupId)
		]);
		return { monthlyStats, monthSquashedStats };
	}, [speciesName, viewedGroupId]);
	const { data, isLoading } = useLazyTabData(
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
	// Independent of `combineYears` — applies to whichever view is shown, and
	// resets to Hide (`true`) on tab remount alongside `combineYears`.
	const [hideEmptyMonths, setHideEmptyMonths] = useState(true);

	if (isLoading || data === undefined) {
		return (
			<div className="flex items-center justify-center">
				<div className="loading loading-spinner loading-xl"></div>
			</div>
		);
	}
	const { monthlyStats, monthSquashedStats } = data;

	// ON: 12 calendar-month buckets, already summed across every year in SQL via
	// `core_stats`' `'month-squashed'` mode (#996). Look each row back up by its
	// sentinel `time_period` (there's no year to link to, so no href) and format
	// its label on demand.
	const combinedMonthRows = buildCombinedMonthTotalsRows(monthSquashedStats);
	const combinedMonthLabelByTimePeriod = new Map(
		combinedMonthRows.map((row) => [
			row.stats.time_period,
			formatMonthLabel(row)
		])
	);

	// OFF: one row per real `(year, month)` combination the species actually has
	// data for — no zero-filling, no summing across years — linking into the
	// species' year/month drill-down route, same shape `SpMonthTotalsTab` uses.
	const perYearRows = buildPerYearMonthTotalsRows(monthlyStats);
	const perYearRowByTimePeriod = new Map(
		perYearRows.map((row) => [row.stats.time_period, row])
	);

	// Both toggles are independent state; the empty-months filter applies to
	// whichever row array is currently displayed. Combined and by-year both carry
	// both controls.
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
					rows={filterEmptyMonthTotalsRows(
						combinedMonthRows,
						hideEmptyMonths
					).map((row) => row.stats)}
					firstColumnHeader="Month"
					showSpeciesColumn={false}
					buildHref={() => ''}
					buildLabel={(timePeriod) =>
						combinedMonthLabelByTimePeriod.get(timePeriod) ?? ''
					}
					extraControls={extraControls}
				/>
			) : (
				<PeriodTotalsTable
					timeInterval="month"
					showSpeciesColumn={false}
					rows={filterEmptyMonthTotalsRows(perYearRows, hideEmptyMonths).map(
						(row) => row.stats
					)}
					firstColumnHeader="Month"
					buildHref={(timePeriod) => {
						const row = perYearRowByTimePeriod.get(timePeriod);
						return row
							? `/species/${speciesName}/${row.year}/${row.zeroIndexedMonth + 1}`
							: '';
					}}
					buildLabel={(timePeriod) =>
						formatMonthYearLabel(perYearRowByTimePeriod.get(timePeriod))
					}
					extraControls={extraControls}
				/>
			)}
		</>
	);
}
