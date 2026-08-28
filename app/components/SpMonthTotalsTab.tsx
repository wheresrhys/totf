'use client';
import { useState, useEffect } from 'react';
import { fetchSpeciesPeriodTotals } from '../actions/sp-data';
import { PeriodTotalsTable } from './PeriodTotalsTable';
import { buildMonthTotalsRows } from '@/app/models/month-totals';
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
	// only spans actual session months. `href`/`label` from `buildMonthTotalsRows`
	// point at `/summary/...`, so both are overridden below for the species route.
	const monthTotalsRows = buildMonthTotalsRows(year, monthlyStats);
	const monthTotalsByTimePeriod = new Map(
		monthTotalsRows.map((row) => [row.stats.time_period, row])
	);

	return (
		<PeriodTotalsTable
			grouping="month"
			rows={monthTotalsRows.map((row) => row.stats)}
			firstColumnHeader="Month"
			buildHref={(timePeriod) =>
				`/species/${speciesName}/${year}/${Number(timePeriod.slice(5, 7))}`
			}
			buildLabel={(timePeriod) =>
				monthTotalsByTimePeriod.get(timePeriod)?.label ?? ''
			}
		/>
	);
}
