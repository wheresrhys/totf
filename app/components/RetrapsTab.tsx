'use client';
import { useState, useEffect } from 'react';
import { SecondaryHeading } from '@/app/components/shared/DesignSystem';
import { fetchNotableRetraps } from '../actions/single-species-data';
import { NotableRetrapsTable } from './NotableRetrapsTable';
import type { NotableRetrapsResult } from '@/app/models/db';

export function RetrapsTab({
	speciesName,
	viewedGroupId
}: {
	speciesName: string;
	viewedGroupId: number;
}) {
	const [notableRetraps, setNotableRetraps] = useState<NotableRetrapsResult[]>(
		[]
	);
	const [isLoaded, setIsLoaded] = useState(false);
	useEffect(() => {
		if (notableRetraps.length > 0) return;
		fetchNotableRetraps(speciesName, viewedGroupId).then((data) => {
			setNotableRetraps(data);
			setIsLoaded(true);
		});
	}, [speciesName, viewedGroupId, notableRetraps.length]);
	return (
		<>
			<SecondaryHeading>Notable Retraps</SecondaryHeading>
			{notableRetraps.length > 0 ? (
				<NotableRetrapsTable data={notableRetraps} omitSpeciesName={true} />
			) : isLoaded ? (
				<p>No notable retraps found</p>
			) : (
				<div className="loading loading-spinner loading-xl"></div>
			)}
			{isLoaded ? null : (
				<div className="flex items-center justify-center">
					<div className="loading loading-spinner loading-xl"></div>
				</div>
			)}
		</>
	);
}
