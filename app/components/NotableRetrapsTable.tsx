'use client';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import {
	type ColumnConfig,
	SortableTable,
	type RowModelWithRawData
} from '@/app/components/shared/SortableTable';
import { NotableRetrapsResult } from '@/app/models/db';
import { EncountersTimeline } from './EncountersTimeline';

const columnConfigsWithoutSpeciesName: Record<
	keyof Omit<NotableRetrapsResult, 'species_name'>,
	ColumnConfig
> = {
	ring_no: {
		label: 'Ring'
	},
	proven_age: {
		label: 'Proven age'
	},
	encounter_count: {
		label: 'Count'
	},
	encounter_dates: {
		label: 'Timeline'
	}
};

const columnConfigsWithSpeciesName: Record<
	keyof NotableRetrapsResult,
	ColumnConfig
> = {
	species_name: {
		label: 'Species'
	},
	...columnConfigsWithoutSpeciesName
};

function getMaxMinYear(birds: NotableRetrapsResult[]): {
	maxYear: number;
	minYear: number;
} {
	const allYears = birds.flatMap((bird) =>
		bird.encounter_dates.map((date) => new Date(date).getFullYear())
	);

	return {
		maxYear: Math.max(...allYears),
		minYear: Math.min(...allYears)
	};
}

function NotableRetrapsTableBody({
	data,
	omitSpeciesName = false
}: {
	data: RowModelWithRawData<NotableRetrapsResult, NotableRetrapsResult>[];
	omitSpeciesName?: boolean;
}) {
	const maxMinYear = getMaxMinYear(data);
	return (
		<tbody>
			{data.map((bird) => (
				<tr key={`${bird.ring_no}`}>
					{omitSpeciesName ? null : <td>{bird.species_name}</td>}
					<td>
						<NoPrefetchLink className="link" href={`/bird/${bird.ring_no}`}>
							{bird.ring_no}
						</NoPrefetchLink>
					</td>
					<td>{bird.proven_age}</td>
					<td>{bird.encounter_count}</td>
					<td>
						<EncountersTimeline
							encounters={bird.encounter_dates.map((date) => new Date(date))}
							{...maxMinYear}
						/>
					</td>
				</tr>
			))}
		</tbody>
	);
}

function NotableRetrapsTableBodyWithoutSpeciesName({
	data
}: {
	data: RowModelWithRawData<
		NotableRetrapsResult,
		Omit<NotableRetrapsResult, 'species_name'>
	>[];
}) {
	return (
		<NotableRetrapsTableBody
			data={
				data as RowModelWithRawData<
					NotableRetrapsResult,
					NotableRetrapsResult
				>[]
			}
			omitSpeciesName={true}
		/>
	);
}

function NotableRetrapsTableBodyWithSpeciesName({
	data
}: {
	data: RowModelWithRawData<NotableRetrapsResult, NotableRetrapsResult>[];
}) {
	return <NotableRetrapsTableBody data={data} omitSpeciesName={false} />;
}

export function NotableRetrapsTable({
	data,
	omitSpeciesName = false
}: {
	data: NotableRetrapsResult[];
	omitSpeciesName?: boolean;
}) {
	return omitSpeciesName ? (
		<SortableTable<
			NotableRetrapsResult,
			Omit<NotableRetrapsResult, 'species_name'>
		>
			columnConfigs={columnConfigsWithoutSpeciesName}
			data={data}
			rowDataTransform={(
				row: NotableRetrapsResult
			): Omit<NotableRetrapsResult, 'species_name'> =>
				row as Omit<NotableRetrapsResult, 'species_name'>
			}
			TableBodyComponent={NotableRetrapsTableBodyWithoutSpeciesName}
		/>
	) : (
		<SortableTable<NotableRetrapsResult, NotableRetrapsResult>
			columnConfigs={columnConfigsWithSpeciesName}
			data={data}
			rowDataTransform={(row: NotableRetrapsResult): NotableRetrapsResult =>
				row
			}
			TableBodyComponent={NotableRetrapsTableBodyWithSpeciesName}
		/>
	);
}
