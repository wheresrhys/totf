'use client';
import { WeightVsWingLengthChart } from '@/app/components/WeightAndWingChart';

export function WeightWingTab({
	speciesId,
	viewedGroupId
}: {
	speciesId: number;
	viewedGroupId: number;
}) {
	return (
		<WeightVsWingLengthChart
			speciesId={speciesId}
			viewedGroupId={viewedGroupId}
		/>
	);
}
