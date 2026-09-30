'use client';
import { useState, useEffect } from 'react';
import { fetchSpeciesPeriodTotals } from '@/app/actions/sp-data';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import {
	formatMonthYearLabel,
	type MonthTotalsRow
} from '@/app/lib/month-totals';
import type { CoreStatsResult } from '@/app/models/db';

// `fetchSpeciesPeriodTotals(..., 'year', ..., squashedMonth)` returns one
// row per year (bucketed by year, but every column already computed only
// from that year's `squashedMonth` sessions) — reshape into `MonthTotalsRow`
// so `formatMonthYearLabel` can print "January 2026" rather than plain
// "2026" (explicit spec).
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

// The squashed-month species page's "Year totals" tab (#1005) — the
// species-scoped counterpart to `SquashedMonthSummaryTotalsSection`'s Year
// totals tab. One row per year, filtered to `squashedMonth`.
export function SpSquashedMonthYearTotalsTab({
	speciesName,
	viewedGroupId,
	squashedMonth
}: {
	speciesName: string;
	viewedGroupId: number;
	squashedMonth: number;
}) {
	const [yearTotals, setYearTotals] = useState<CoreStatsResult[]>([]);
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		if (isLoaded) return;
		fetchSpeciesPeriodTotals(
			speciesName,
			viewedGroupId,
			'year',
			undefined,
			undefined,
			squashedMonth
		).then((data) => {
			setYearTotals(data);
			setIsLoaded(true);
		});
	}, [speciesName, viewedGroupId, squashedMonth, isLoaded]);

	if (!isLoaded) {
		return (
			<div className="flex items-center justify-center">
				<div className="loading loading-spinner loading-xl"></div>
			</div>
		);
	}

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
