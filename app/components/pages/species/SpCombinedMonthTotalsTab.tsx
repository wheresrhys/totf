'use client';
import { useState } from 'react';
import type {
	SpeciesTotalsTabParams,
	SpCombinedMonthTotalsData
} from '@/app/actions/sp-data';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import {
	buildCombinedMonthTotalsRows,
	buildPerYearMonthTotalsRows,
	filterEmptyMonthTotalsRows,
	formatMonthYearLabel,
	formatMonthLabel
} from '@/app/lib/month-totals';
import { CombineYearsToggle } from '@/app/components/shared/CombineYearsToggle';
import { EmptyMonthsToggle } from '@/app/components/shared/EmptyMonthsToggle';
import { buildSpeciesSquashedMonthHref } from '@/app/lib/squashed-month';
import type { ViewedGroup } from '@/app/lib/group-slug';

// Pure, presentational `TabConfig.TabComponent` (#1066) — see
// `SpYearTotalsTab`'s doc comment for why `data` is typed `unknown` and cast
// back to this tab's real shape immediately. Fetching/loading/error state now
// lives in `TabContent` (#1057), driven by `fetchCombinedMonthTotalsTabData`
// (`app/actions/sp-data.ts`) via `TabSet`/`buildSpeciesTotalsTabs`
// (`species-tabs.ts`) — previously this component called `useLazyTabData`
// itself, gated by an explicit `isActive` prop; both are gone now that
// `TabContent` owns that lifecycle.
export function SpCombinedMonthTotalsTab({
	params,
	data
}: {
	params: SpeciesTotalsTabParams;
	data: unknown;
	viewedGroup: ViewedGroup;
}) {
	const { speciesName } = params;
	const { monthlyStats, monthSquashedStats } =
		(data as SpCombinedMonthTotalsData | null) ?? {
			monthlyStats: [],
			monthSquashedStats: []
		};

	// Defaults to ON (combined) — resets each time this tab remounts, mirroring
	// `SummaryTotalsSection`'s `AllTimeMonthTotalsTab`, since `TabSet`'s
	// `ConditionalTabPanel` unmounts this tab on every tab switch.
	const [combineYears, setCombineYears] = useState(true);
	// Independent of `combineYears` — applies to whichever view is shown, and
	// resets to Hide (`true`) on tab remount alongside `combineYears`.
	const [hideEmptyMonths, setHideEmptyMonths] = useState(true);

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
					// Links into the squashed-month species page (#1005) for this
					// calendar month — no single year to drill into, but every
					// occurrence of the month across the group's whole history.
					buildHref={(timePeriod) =>
						buildSpeciesSquashedMonthHref(
							speciesName,
							Number(timePeriod.slice(5, 7))
						)
					}
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
