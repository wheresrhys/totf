'use client';
import { useState } from 'react';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { CombineYearsToggle } from '@/app/components/shared/CombineYearsToggle';
import { EmptyMonthsToggle } from '@/app/components/shared/EmptyMonthsToggle';
import {
	fetchPeriodStats,
	fetchCombinedMonthTotals
} from '@/app/actions/summary-stats';
import {
	buildCombinedMonthTotalsRows,
	buildPerYearMonthTotalsRows,
	filterEmptyMonthTotalsRows,
	formatMonthYearLabel,
	formatMonthLabel
} from '@/app/lib/month-totals';
import { buildGroupSummaryHref } from '@/app/lib/group-links';
import { buildGroupSquashedMonthSummaryHref } from '@/app/lib/squashed-month';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { SummaryTabParams } from './summary-tab-params';

export const ALL_TIME_MONTH_TOTALS_TAB_ID = 'all-time-month-totals';

async function fetchAllTimeMonthTotalsData(
	_params: SummaryTabParams,
	viewedGroup: ViewedGroup
) {
	const [periodStats, monthSquashedStats] = await Promise.all([
		fetchPeriodStats(viewedGroup.id, 'month'),
		fetchCombinedMonthTotals(viewedGroup.id)
	]);
	return { periodStats, monthSquashedStats };
}

// The all-time page's combine-years "Month totals" tab content, moved out of
// `SummaryTotalsSection.tsx` verbatim (#1072). Owns the "Combine years" and
// "Hide empty months" toggles' local state.
//
// Since this panel now renders through `ConditionalTabPanel`'s hide-not-
// unmount semantics (rather than the old `{isActive && (...)}` JSX in
// `SummaryTotalsSection.tsx`, which fully unmounted it on every tab switch),
// that toggle state now *persists* across reselecting this tab within one
// page view instead of resetting to its default each time — a deliberate
// consequence of hide-not-unmount (#1072), not a regression.
function AllTimeMonthTotalsTab({
	periodStats,
	monthSquashedStats,
	totalsStats,
	viewedGroup
}: {
	periodStats: CoreStatsResult[];
	monthSquashedStats: CoreStatsResult[];
	totalsStats?: CoreStatsResult;
	viewedGroup?: ViewedGroup;
}) {
	const [combineYears, setCombineYears] = useState(true);
	// Sibling of `combineYears` — independent state, applies to whichever view is
	// shown, and persists alongside it (see the doc comment above).
	const [hideEmptyMonths, setHideEmptyMonths] = useState(true);

	// ON: 12 calendar-month buckets, already summed across every year in SQL via
	// `core_stats`' `'month-squashed'` mode. Look each row back up by its
	// sentinel `time_period` (there's no year to link to, so no href) and format
	// its label on demand.
	const combinedRows = buildCombinedMonthTotalsRows(monthSquashedStats);
	const combinedLabelByTimePeriod = new Map(
		combinedRows.map((row) => [row.stats.time_period, formatMonthLabel(row)])
	);

	// OFF: one row per real `(year, month)` combination, unsummed. Look each
	// row back up by `time_period` so the shared table can derive its
	// label/href from the raw row rather than re-deriving from the date string.
	const perYearRows = buildPerYearMonthTotalsRows(periodStats);
	const perYearRowByTimePeriod = new Map(
		perYearRows.map((row) => [row.stats.time_period, row])
	);

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
					rows={filterEmptyMonthTotalsRows(combinedRows, hideEmptyMonths).map(
						(row) => row.stats
					)}
					firstColumnHeader="Month"
					// Links into the squashed-month summary page (#1005) for this
					// calendar month — no single year to drill into, but every
					// occurrence of the month across the group's whole history.
					buildHref={(timePeriod) =>
						buildGroupSquashedMonthSummaryHref(
							viewedGroup,
							Number(timePeriod.slice(5, 7))
						)
					}
					buildLabel={(timePeriod) =>
						combinedLabelByTimePeriod.get(timePeriod) ?? ''
					}
					totalsStats={totalsStats}
					extraControls={extraControls}
				/>
			) : (
				<PeriodTotalsTable
					timeInterval="month"
					rows={filterEmptyMonthTotalsRows(perYearRows, hideEmptyMonths).map(
						(row) => row.stats
					)}
					firstColumnHeader="Month"
					buildHref={(timePeriod) => {
						const row = perYearRowByTimePeriod.get(timePeriod);
						return buildGroupSummaryHref(
							viewedGroup,
							row && { year: row.year, month: row.zeroIndexedMonth + 1 }
						);
					}}
					buildLabel={(timePeriod) =>
						formatMonthYearLabel(perYearRowByTimePeriod.get(timePeriod))
					}
					totalsStats={totalsStats}
					extraControls={extraControls}
				/>
			)}
		</>
	);
}

// Exported so call sites (e.g. `SummaryTotalsSection`'s `initialTabData` spread)
// can cast a server-prefetched `unknown` payload back to this tab's concrete
// `DataType` without reaching for `as unknown as` (#921).
export type SummaryAllTimeMonthTotalsData = Awaited<
	ReturnType<typeof fetchAllTimeMonthTotalsData>
>;

export const summaryAllTimeMonthTotalsTab: TabConfig<
	SummaryAllTimeMonthTotalsData,
	SummaryTabParams
> = {
	id: ALL_TIME_MONTH_TOTALS_TAB_ID,
	label: 'Month totals',
	dataFetcher: fetchAllTimeMonthTotalsData,
	TabComponent: ({ params, data, viewedGroup }) => (
		<AllTimeMonthTotalsTab
			periodStats={data?.periodStats ?? []}
			monthSquashedStats={data?.monthSquashedStats ?? []}
			totalsStats={params.totalsStats}
			viewedGroup={viewedGroup}
		/>
	)
};
