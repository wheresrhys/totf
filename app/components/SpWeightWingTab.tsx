'use client';
import { WeightVsWingLengthChart } from '@/app/components/WeightAndWingChart';

export function SpWeightWingTab({
	speciesId,
	viewedGroupId,
	fromDate,
	toDate
}: {
	speciesId: number;
	viewedGroupId: number;
	fromDate?: string;
	toDate?: string;
}) {
	return (
		<WeightVsWingLengthChart
			speciesId={speciesId}
			viewedGroupId={viewedGroupId}
			fromDate={fromDate}
			toDate={toDate}
		/>
	);
}
