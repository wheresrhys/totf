'use client';
import { useState, useEffect } from 'react';
import { fetchSpeciesPeriodTotals } from '@/app/actions/sp-data';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import type { CoreStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';

export function SpSessionTotalsTab({
	speciesName,
	viewedGroup,
	fromDate,
	toDate,
	monthFilter
}: {
	speciesName: string;
	viewedGroup: ViewedGroup;
	fromDate?: string;
	toDate?: string;
	// Set only by the squashed-month route (#1005) — mutually exclusive with
	// `fromDate`/`toDate`, filters every session day to this calendar month
	// across every year rather than a single real date range.
	monthFilter?: number;
}) {
	const [sessionTotals, setSessionTotals] = useState<CoreStatsResult[]>([]);
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		if (isLoaded) return;
		fetchSpeciesPeriodTotals(
			speciesName,
			viewedGroup.id,
			'day',
			fromDate,
			toDate,
			monthFilter
		).then((data) => {
			setSessionTotals(data);
			setIsLoaded(true);
		});
	}, [speciesName, viewedGroup, fromDate, toDate, monthFilter, isLoaded]);

	if (!isLoaded) {
		return (
			<div className="flex items-center justify-center">
				<div className="loading loading-spinner loading-xl"></div>
			</div>
		);
	}

	return (
		<PeriodTotalsTable
			timeInterval="day"
			rows={sessionTotals}
			firstColumnHeader="Session"
			buildHref={(timePeriod) =>
				`/group/${viewedGroup.slug}/session/${timePeriod}`
			}
			showBusiestSession={false}
		/>
	);
}
