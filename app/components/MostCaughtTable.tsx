'use client';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import {
	type ColumnConfig,
	SortableTable,
	type RowModelWithRawData
} from '@/app/components/shared/SortableTable';
import { MostCaughtResult } from '@/app/models/db';

const columnConfigs: Record<keyof MostCaughtResult, ColumnConfig> = {
	species_name: {
		label: 'Species'
	},
	ring_no: {
		label: 'Bird'
	},
	encounter_count: {
		label: 'Encounters'
	}
};

function MostCaughtTableBody({
	data
}: {
	data: RowModelWithRawData<MostCaughtResult, MostCaughtResult>[];
}) {
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

					<td>{bird.encounter_count}</td>
				</tr>
			))}
		</tbody>
	);
}
export function MostCaughtTable({ data }: { data: MostCaughtResult[] }) {
	return (
		<SortableTable<MostCaughtResult, MostCaughtResult>
			columnConfigs={columnConfigs}
			data={data}
			rowDataTransform={(row: MostCaughtResult): MostCaughtResult => row}
			TableBodyComponent={MostCaughtTableBody}
		/>
	);
}
