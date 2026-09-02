'use client';
import { useState, useEffect } from 'react';
import { fetchSpeciesPeriodTotals } from '../actions/sp-data';
import { PeriodTotalsTable } from './PeriodTotalsTable';
import type { AggregateStatsResult } from '@/app/models/db';

export function SpYearTotalsTab({
	speciesName,
	viewedGroupId
}: {
	speciesName: string;
	viewedGroupId: number;
}) {
	const [yearTotals, setYearTotals] = useState<AggregateStatsResult[]>([]);
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		if (isLoaded) return;
		fetchSpeciesPeriodTotals(speciesName, viewedGroupId, 'year').then(
			(data) => {
				setYearTotals(data);
				setIsLoaded(true);
			}
		);
	}, [speciesName, viewedGroupId, isLoaded]);

	if (!isLoaded) {
		return (
			<div className="flex items-center justify-center">
				<div className="loading loading-spinner loading-xl"></div>
			</div>
		);
	}

	return (
		<PeriodTotalsTable
			grouping="year"
			rows={yearTotals}
			firstColumnHeader="Year"
			buildHref={(timePeriod) =>
				`/species/${speciesName}/${timePeriod.slice(0, 4)}`
			}
		/>
	);
}
