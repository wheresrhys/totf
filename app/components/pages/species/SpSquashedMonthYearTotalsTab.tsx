'use client';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import {
	formatMonthYearLabel,
	type MonthTotalsRow
} from '@/app/lib/month-totals';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import type { ViewedGroup } from '@/app/lib/group-slug';

// `fetchSquashedMonthYearTotalsTabData(..., 'year', ..., squashedMonth)`
// returns one row per year (bucketed by year, but every column already
// computed only from that year's `squashedMonth` sessions) — reshape into
// `MonthTotalsRow` so `formatMonthYearLabel` can print "January 2026" rather
// than plain "2026" (explicit spec).
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

// Pure, presentational `TabConfig.TabComponent` (#1066) — see
// `SpYearTotalsTab`'s doc comment for why `data` is typed `unknown` and cast
// back to this tab's real shape immediately. Fetching/loading/error state now
// lives in `TabContent` (#1057), driven by `fetchSquashedMonthYearTotalsTabData`
// (`app/actions/sp-data.ts`) via `TabSet`/`buildSpeciesTotalsTabs`
// (`species-tabs.ts`) — previously this component handrolled its own
// `useState`/`useEffect` fetch with no `.catch`.
//
// The squashed-month species page's "Year totals" tab (#1005) — the
// species-scoped counterpart to `SquashedMonthSummaryTotalsSection`'s Year
// totals tab. One row per year, filtered to `squashedMonth`.
export function SpSquashedMonthYearTotalsTab({
	params,
	data
}: {
	params: SpeciesTotalsTabParams;
	data: unknown;
	viewedGroup: ViewedGroup;
}) {
	const { speciesName } = params;
	// Always defined when this tab is mounted — `buildSpeciesTotalsTabs`
	// (`species-tabs.ts`) only includes `squashed-month-year-totals` when the
	// route is squashed-month-scoped, which is also what supplies
	// `monthFilter` on the shared `totalsTabParams`.
	const squashedMonth = params.monthFilter as number;
	const yearTotals = (data as CoreStatsResult[] | null) ?? [];

	const yearTotalsRows = toYearTotalsRows(yearTotals, squashedMonth);
	const yearTotalsRowByTimePeriod = new Map(
		yearTotalsRows.map((row) => [row.stats.time_period, row])
	);

	return (
		<PeriodTotalsTable
			timeInterval="year"
			rows={yearTotalsRows.map((row) => row.stats)}
			firstColumnHeader="Year"
			showSpeciesColumn={false}
			buildHref={(timePeriod) => {
				const row = yearTotalsRowByTimePeriod.get(timePeriod);
				return row
					? `/species/${speciesName}/${row.year}/${squashedMonth}`
					: '';
			}}
			buildLabel={(timePeriod) =>
				formatMonthYearLabel(yearTotalsRowByTimePeriod.get(timePeriod))
			}
		/>
	);
}
