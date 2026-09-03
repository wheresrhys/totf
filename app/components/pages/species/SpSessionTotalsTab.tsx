'use client';
import { useState, useEffect } from 'react';
import { fetchSpeciesPeriodTotals } from '@/app/actions/sp-data';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import type { AggregateStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/lib/group-slug';

export function SpSessionTotalsTab({
	speciesName,
	viewedGroup,
	fromDate,
	toDate
}: {
	speciesName: string;
	viewedGroup: ViewedGroup;
	fromDate?: string;
	toDate?: string;
}) {
	const [sessionTotals, setSessionTotals] = useState<AggregateStatsResult[]>(
		[]
	);
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		if (isLoaded) return;
		fetchSpeciesPeriodTotals(
			speciesName,
			viewedGroup.id,
			'day',
			fromDate,
			toDate
		).then((data) => {
			setSessionTotals(data);
			setIsLoaded(true);
		});
	}, [speciesName, viewedGroup, fromDate, toDate, isLoaded]);

	if (!isLoaded) {
		return (
			<div className="flex items-center justify-center">
				<div className="loading loading-spinner loading-xl"></div>
			</div>
		);
	}

	return (
		<PeriodTotalsTable
			grouping="day"
			rows={sessionTotals}
			firstColumnHeader="Session"
			buildHref={(timePeriod) =>
				`/group/${viewedGroup.slug}/session/${timePeriod}`
			}
		/>
	);
}
