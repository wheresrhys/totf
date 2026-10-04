'use client';
import { useState } from 'react';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { EmptyMonthsToggle } from '@/app/components/shared/EmptyMonthsToggle';
import {
	filterEmptyMonthTotalsRows,
	formatMonthYearLabel
} from '@/app/lib/month-totals';
import { buildGroupSummaryHref } from '@/app/lib/group-links';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { SummaryTabParams } from './summary-tab-params';

export const MONTH_TOTALS_TAB_ID = 'month-totals';

// The year summary page's per-year "Month totals" tab — distinct from the
// all-time page's combine-years "Month totals" tab
// (`SummaryAllTimeMonthTotalsTab`): same label, different semantics (12 rows
// for one year, encounters-only, vs. 12 rows summed across every year).
// Extracted from `SummaryTotalsSection`'s local `YearMonthTotalsTab` function
// (#1067). This panel now renders through `ConditionalTabPanel`'s
// hide-not-unmount semantics (via the shared `TabSet`) rather than the old
// `{activeTab === ... && (...)}` JSX that fully unmounted it on every tab
// switch, so `hideEmptyMonths` now persists for the rest of the page view
// once this tab has first loaded, instead of resetting to its default each
// time it's reselected — a deliberate, accepted consequence of
// hide-not-unmount (consistent with every other converged tab's local UI
// state), not a regression to fix.
function MonthTotalsTab({
	params,
	viewedGroup
}: {
	params: SummaryTabParams;
	viewedGroup?: ViewedGroup;
}) {
	const monthTotals = params.monthTotals ?? [];
	const [hideEmptyMonths, setHideEmptyMonths] = useState(true);

	const monthTotalsByTimePeriod = new Map(
		monthTotals.map((row) => [row.stats.time_period, row])
	);
	const visibleRows = filterEmptyMonthTotalsRows(monthTotals, hideEmptyMonths);

	return (
		<PeriodTotalsTable
			timeInterval="month"
			rows={visibleRows.map((row) => row.stats)}
			firstColumnHeader="Month"
			buildHref={(timePeriod) => {
				const row = monthTotalsByTimePeriod.get(timePeriod);
				return buildGroupSummaryHref(
					viewedGroup,
					row && { year: row.year, month: row.zeroIndexedMonth + 1 }
				);
			}}
			buildLabel={(timePeriod) =>
				formatMonthYearLabel(monthTotalsByTimePeriod.get(timePeriod))
			}
			totalsStats={
				params.tabsWithTotalsRow?.[MONTH_TOTALS_TAB_ID]
					? params.totalsStats
					: undefined
			}
			extraControls={
				<EmptyMonthsToggle
					value={hideEmptyMonths}
					onChange={setHideEmptyMonths}
				/>
			}
		/>
	);
}

// Prop-fed, no `dataFetcher` — `monthTotals` arrives already-resolved from
// the year summary page's own fetch (#1067).
export const summaryMonthTotalsTab: TabConfig<null, SummaryTabParams> = {
	id: MONTH_TOTALS_TAB_ID,
	label: 'Month totals',
	TabComponent: ({ params, viewedGroup }) => (
		<MonthTotalsTab params={params} viewedGroup={viewedGroup} />
	)
};
