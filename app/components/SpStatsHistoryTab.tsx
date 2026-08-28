'use client';
import { StatsHistoryChart } from '@/app/components/StatsHistoryChart';

export function SpStatsHistoryTab({
	speciesName,
	viewedGroupId,
	fromDate,
	toDate
}: {
	speciesName: string;
	viewedGroupId: number;
	fromDate?: string;
	toDate?: string;
}) {
	return (
		<StatsHistoryChart
			speciesName={speciesName}
			viewedGroupId={viewedGroupId}
			fromDate={fromDate}
			toDate={toDate}
		/>
	);
}
