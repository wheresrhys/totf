'use client';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import {
	type ColumnConfig,
	SortableTable,
	type RowModelWithRawData
} from '@/app/components/shared/SortableTable';
import { DiscrepenciesResult } from '@/app/models/db';

type MistakesTableRowModel = Omit<DiscrepenciesResult, 'bird_id'>;

const columnConfigs: Record<keyof MistakesTableRowModel, ColumnConfig> = {
	ring_no: {
		label: 'Bird'
	},
	species_name: {
		label: 'Species'
	},
	discrepency_type: {
		label: 'Discrepency Type'
	}
};

function MistakesTableBody({
	data
}: {
	data: RowModelWithRawData<DiscrepenciesResult, MistakesTableRowModel>[];
}) {
	return (
		<tbody>
			{data.map((mistake) => (
				<tr key={`${mistake.ring_no}-${mistake.discrepency_type}`}>
					<td>
						<NoPrefetchLink className="link" href={`/bird/${mistake.ring_no}`}>
							{mistake.ring_no}
						</NoPrefetchLink>
					</td>
					<td>{mistake.species_name}</td>
					<td>{mistake.discrepency_type}</td>
				</tr>
			))}
		</tbody>
	);
}
export function MistakesTable({
	mistakes
}: {
	mistakes: DiscrepenciesResult[];
}) {
	return (
		<SortableTable<DiscrepenciesResult, MistakesTableRowModel>
			columnConfigs={columnConfigs}
			data={mistakes}
			rowDataTransform={(row: DiscrepenciesResult): MistakesTableRowModel =>
				row
			}
			TableBodyComponent={MistakesTableBody}
		/>
	);
}
