'use client';

import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { buildGroupSummaryHref } from '@/app/lib/group-links';
import {
	formatMonthYearLabel,
	type MonthTotalsRow
} from '@/app/lib/month-totals';
import type { CoreStatsResult } from '@/app/models/db';
import type { TabConfig } from '@/app/components/shared/TabContent';
import {
	SQUASHED_MONTH_YEAR_TOTALS_TAB_ID,
	type SquashedMonthTabParams
} from './squashed-month-tab-params';

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

// No `dataFetcher`: the rows arrive via `TabSet`'s shared params — see
// `SquashedMonthSpeciesTotalsTab.tsx` for the rationale.
export const squashedMonthYearTotalsTab: TabConfig<
	unknown,
	SquashedMonthTabParams
> = {
	id: SQUASHED_MONTH_YEAR_TOTALS_TAB_ID,
	label: 'Year totals',
	TabComponent: ({ params, viewedGroup }) => {
		const { squashedMonth, yearTotalsForMonth, totalsStats } = params;
		const yearTotalsRows = toYearTotalsRows(yearTotalsForMonth, squashedMonth);
		const yearTotalsRowByTimePeriod = new Map(
			yearTotalsRows.map((row) => [row.stats.time_period, row])
		);
		return (
			<PeriodTotalsTable
				timeInterval="year"
				rows={yearTotalsRows.map((row) => row.stats)}
				firstColumnHeader="Year"
				// Every row links into the *requested* squashed month of its own
				// year, not whatever month its `time_period` happens to name — the
				// rows are year buckets of one recurring month.
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
		);
	}
};
