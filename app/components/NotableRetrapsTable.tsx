'use client';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import {
	type ColumnConfig,
	SortableTable,
	type RowModelWithRawData
} from '@/app/components/shared/SortableTable';
import { NotableRetrapsResult } from '@/app/models/db';
import { EncountersTimeline } from './EncountersTimeline';

const columnConfigs: Record<keyof NotableRetrapsResult, ColumnConfig> = {
	species_name: {
		label: 'Species'
	},
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
	data
}: {
	data: RowModelWithRawData<NotableRetrapsResult, NotableRetrapsResult>[];
}) {
	const maxMinYear = getMaxMinYear(data);
	return (
		<tbody>
			{data.map((bird) => (
				<tr key={`${bird.ring_no}`}>
					<td>{bird.species_name}</td>
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
export function NotableRetrapsTable({
	data
}: {
	data: NotableRetrapsResult[];
}) {
	return (
		<SortableTable<NotableRetrapsResult, NotableRetrapsResult>
			columnConfigs={columnConfigs}
			data={data}
			rowDataTransform={(row: NotableRetrapsResult): NotableRetrapsResult =>
				row
			}
			TableBodyComponent={NotableRetrapsTableBody}
		/>
	);
}
