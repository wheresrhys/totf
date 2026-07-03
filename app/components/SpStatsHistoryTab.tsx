'use client';
import { StatsHistoryChart } from '@/app/components/StatsHistoryChart';

export function SpStatsHistoryTab({
	speciesName,
	viewedGroupId
}: {
	speciesName: string;
	viewedGroupId: number;
}) {
	return (
		<StatsHistoryChart
			speciesName={speciesName}
			viewedGroupId={viewedGroupId}
		/>
	);
}
