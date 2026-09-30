'use client';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import {
	SortableTable,
	getFormattedValue,
	type ColumnConfig,
	type RowModelWithRawData
} from '@/app/components/shared/SortableTable';

/**
 * One species per row, one stat per column (#115) — the rendering half of the
 * species-comparison page, generic over which of the three by-species stats
 * datasets is on show. All it knows is that a row has a `species_name`; the
 * columns, their labels and their formatters come from the caller
 * (`comparison-columns.ts`).
 *
 * Built on the shared `SortableTable` so the comparison is sortable by any
 * column for free. Its own body component (rather than
 * `createStatsTableBody`) because these columns need their `formatter`s
 * applied — `createStatsTableBody` renders raw values, which would print
 * Postgres interval strings verbatim and leave a missing measurement as an
 * empty cell.
 */
export function SpeciesComparisonTable<
	RowModel extends { species_name: string }
>({
	rows,
	columnConfigs,
	testId
}: {
	rows: RowModel[];
	columnConfigs: Partial<Record<keyof RowModel, ColumnConfig>>;
	testId?: string;
}) {
	function SpeciesComparisonTableBody({
		data,
		columnConfigs
	}: {
		data: RowModelWithRawData<RowModel, RowModel>[];
		columnConfigs?: Partial<Record<keyof RowModel, ColumnConfig>>;
	}) {
		const valueColumnProperties = Object.keys(columnConfigs ?? {}).filter(
			(property) => property !== 'species_name'
		) as (keyof RowModel)[];
		const formatCell = getFormattedValue<RowModel>(columnConfigs ?? {});

		return (
			<tbody>
				{data.map((row) => (
					<tr key={row.species_name}>
						<td>
							<NoPrefetchLink
								className="link text-wrap"
								href={`/species/${row.species_name}`}
							>
								{row.species_name}
							</NoPrefetchLink>
						</td>
						{valueColumnProperties.map((property) => (
							<td
								key={property as string}
								className={columnConfigs?.[property]?.cellClassName}
							>
								{formatCell(row[property], property)}
							</td>
						))}
					</tr>
				))}
			</tbody>
		);
	}

	return (
		<SortableTable<RowModel, RowModel>
			columnConfigs={columnConfigs}
			data={rows}
			testId={testId}
			rowDataTransform={(row) => row}
			initialSortColumn="species_name"
			TableBodyComponent={SpeciesComparisonTableBody}
		/>
	);
}
