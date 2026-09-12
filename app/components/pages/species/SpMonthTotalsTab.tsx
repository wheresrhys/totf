'use client';
import { useState, useEffect } from 'react';
import { fetchSpeciesPeriodTotals } from '@/app/actions/sp-data';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import {
	buildMonthTotalsRows,
	filterEmptyMonthTotalsRows,
	formatMonthYearLabel
} from '@/app/models/month-totals';
import { EmptyMonthsToggle } from '@/app/components/shared/EmptyMonthsToggle';
import type { AggregateStatsResult } from '@/app/models/db';

export function SpMonthTotalsTab({
	speciesName,
	viewedGroupId,
	year,
	fromDate,
	toDate
}: {
	speciesName: string;
	viewedGroupId: number;
	year: number;
	fromDate?: string;
	toDate?: string;
}) {
	const [monthlyStats, setMonthlyStats] = useState<AggregateStatsResult[]>([]);
	const [isLoaded, setIsLoaded] = useState(false);
	// Plain local state — `SpeciesPageContent`'s `ConditionalTabPanel` unmounts
	// this tab on every tab switch, so the toggle naturally resets to Hide
	// (`true`) each time the tab is revisited, with no extra code needed.
	const [hideEmptyMonths, setHideEmptyMonths] = useState(true);

	useEffect(() => {
		if (isLoaded) return;
		fetchSpeciesPeriodTotals(
			speciesName,
			viewedGroupId,
			'month',
			fromDate,
			toDate
		).then((data) => {
			setMonthlyStats(data);
			setIsLoaded(true);
		});
	}, [speciesName, viewedGroupId, fromDate, toDate, isLoaded]);

	if (!isLoaded) {
		return (
			<div className="flex items-center justify-center">
				<div className="loading loading-spinner loading-xl"></div>
			</div>
		);
	}

	// Zero-fill across all 12 calendar months, same as the year summary page's
	// "Month totals" tab (`summary/[year]/page.tsx`) — `aggregate_stats`'s spine
	// only spans actual session months. The model returns pure data only, so
	// both href and label are derived here for the species route.
	const monthTotalsRows = buildMonthTotalsRows(year, monthlyStats);
	const monthTotalsByTimePeriod = new Map(
		monthTotalsRows.map((row) => [row.stats.time_period, row])
	);
	const visibleRows = filterEmptyMonthTotalsRows(
		monthTotalsRows,
		hideEmptyMonths
	);

	return (
		<PeriodTotalsTable
			timeInterval="month"
			rows={visibleRows.map((row) => row.stats)}
			firstColumnHeader="Month"
			showSpeciesColumn={false}
			buildHref={(timePeriod) =>
				`/species/${speciesName}/${year}/${Number(timePeriod.slice(5, 7))}`
			}
			buildLabel={(timePeriod) =>
				formatMonthYearLabel(monthTotalsByTimePeriod.get(timePeriod))
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
