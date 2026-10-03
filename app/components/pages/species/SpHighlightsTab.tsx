'use client';
import { useState, useEffect, useCallback } from 'react';
import { SecondaryHeading } from '@/app/components/shared/DesignSystem';
import { fetchNotableRetraps } from '@/app/actions/sp-data';
import { NotableRetrapsTable } from '@/app/components/NotableRetrapsTable';
import type { NotableRetrapsResult } from '@/app/models/db';
import { getHighlightsWithinTimeWindow } from '@/app/lib/highlights';
import type { HighlightsOfType } from '@/app/lib/highlights/types';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { HighlightsByTimePeriod } from '../../SummaryTotalsSection';

export function SpHighlightsTab({
	speciesName,
	viewedGroup,
	fromDate,
	toDate,
	year,
	month
}: {
	speciesName: string;
	viewedGroup: ViewedGroup;
	fromDate?: string;
	toDate?: string;
	year?: number;
	month?: number;
}) {
	const [notableRetraps, setNotableRetraps] = useState<NotableRetrapsResult[]>(
		[]
	);
	const [highlightsData, setHighlightsData] = useState<{
		sessionHighlights: HighlightsOfType[];
		monthHighlights: HighlightsOfType[];
	} | null>(null);
	const [isLoaded, setIsLoaded] = useState(false);

	const fetchHighlightsData = useCallback(async () => {
		const [daily, monthly] = await Promise.all([
			getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: viewedGroup.id,
				species: speciesName,
				parentTimeWindow: {
					year,
					month
				},
				excludeGlobal: true,
				includePerSpecies: true
			}),
			month
				? []
				: getHighlightsWithinTimeWindow({
						temporalUnit: 'month',
						groupId: viewedGroup.id,
						species: speciesName,
						parentTimeWindow: {
							year,
							month
						},
						includePerSpecies: true,
						excludeGlobal: true
					})
		]);
		return { sessionHighlights: daily, monthHighlights: monthly };
	}, [viewedGroup.id, year, month, speciesName]);

	useEffect(() => {
		if (isLoaded) return;
		Promise.all([
			fetchHighlightsData(),
			fetchNotableRetraps(speciesName, viewedGroup.id, fromDate, toDate)
		]).then(([highlights, retraps]) => {
			setNotableRetraps(retraps);
			setHighlightsData(highlights);
			setIsLoaded(true);
		});
	}, [speciesName, viewedGroup.id, fromDate, toDate, isLoaded]);
	return (
		<>
			{highlightsData && (
				<>
					<HighlightsByTimePeriod
						highlights={highlightsData.sessionHighlights}
						viewedGroup={viewedGroup}
						heading="Session highlights"
						excludeSpeciesName={true}
					/>
					<HighlightsByTimePeriod
						highlights={highlightsData.monthHighlights}
						viewedGroup={viewedGroup}
						heading="Month highlights"
						excludeSpeciesName={true}
					/>
				</>
			)}

			{notableRetraps.length > 0 ? (
				<>
					<SecondaryHeading>Notable Retraps</SecondaryHeading>
					<NotableRetrapsTable data={notableRetraps} omitSpeciesName={true} />
				</>
			) : isLoaded ? (
				<>
					<SecondaryHeading>Notable Retraps</SecondaryHeading>
					<p>No notable retraps found</p>
				</>
			) : null}
			{isLoaded ? null : (
				<div className="flex items-center justify-center">
					<div className="loading loading-spinner loading-xl"></div>
				</div>
			)}
		</>
	);
}
