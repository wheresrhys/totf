'use client';
import { useState, useEffect } from 'react';
import { getSpeciesYearComparison } from '../actions/sp-data';
import { speciesStatConfigs } from '@/app/models/species-stats';
import {
	SortableTable,
	type ColumnConfig,
	type RowModelWithRawData
} from '@/app/components/shared/SortableTable';
import type { AggregateStatsRow } from '@/app/models/db';

const yearComparisonStatConfigs = speciesStatConfigs.filter(
	(c) => c.property !== 'species_name'
);

const yearComparisonColumnConfigs = {
	time_period: { label: 'Year', invertSort: true },
	...yearComparisonStatConfigs.reduce(
		(acc, c) => ({
			...acc,
			[c.property]: { label: c.label, invertSort: c.invertSort }
		}),
		{}
	)
} as Record<keyof AggregateStatsRow, ColumnConfig>;

function YearComparisonTableBody({
	data
}: {
	data: RowModelWithRawData<AggregateStatsRow, AggregateStatsRow>[];
}) {
	return (
		<tbody>
			{data.map((row) => (
				<tr key={row.time_period}>
					<td>{row.time_period?.slice(0, 4)}</td>
					{yearComparisonStatConfigs.map((c) => (
						<td key={c.property}>{row[c.property]}</td>
					))}
				</tr>
			))}
		</tbody>
	);
}

export function SpYearComparisonTab({
	speciesName,
	viewedGroupId
}: {
	speciesName: string;
	viewedGroupId: number;
}) {
	const [yearData, setYearData] = useState<AggregateStatsRow[]>([]);
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		if (yearData.length > 0) return;
		getSpeciesYearComparison(speciesName, viewedGroupId).then((data) => {
			setYearData(data);
			setIsLoaded(true);
		});
	}, [speciesName, viewedGroupId, yearData.length]);

	if (!isLoaded) {
		return (
			<div className="flex items-center justify-center">
				<div className="loading loading-spinner loading-xl"></div>
			</div>
		);
	}

	if (yearData.length === 0) {
		return <p>No year data found</p>;
	}

	return (
		<SortableTable<AggregateStatsRow, AggregateStatsRow>
			columnConfigs={yearComparisonColumnConfigs}
			data={yearData}
			initialSortColumn="time_period"
			rowDataTransform={(row) => row}
			TableBodyComponent={YearComparisonTableBody}
		/>
	);
}
