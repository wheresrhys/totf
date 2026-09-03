'use client';

import { type SessionEncounter } from '@/app/models/session';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import {
	SortableTable,
	type ColumnConfig,
	type RowModelWithRawData
} from '../../shared/SortableTable';

// Renders the per-bird encounter rows shared by the session page's expanded
// species rows and its net-rounds tab. Both tables render the same 11 core
// columns cell-for-cell; the net-rounds table adds a Species column. This
// component consolidates that shared rendering behind a single, click-to-sort
// implementation.

export type EncountersTableSize = 'xs' | 'responsive';

type EncountersTableProps = {
	encounters: SessionEncounter[];
	// 'xs' → always-compact `table table-xs` (matches both current call sites).
	// 'responsive' → `table table-xs sm:table-md` (the app-wide responsive size).
	size?: EncountersTableSize;
	showTimeColumn?: boolean;
	showSpeciesColumn?: boolean;
	testId?: string;
};

// Keys double as the sortable RowModel's keys, so each names the value the
// column sorts on rather than the column's display slot.
type EncounterColumnKey =
	| 'capture_time'
	| 'ring_no'
	| 'species'
	| 'record_type'
	| 'age_code'
	| 'proven_age'
	| 'sex'
	| 'sexing_method'
	| 'breeding_condition'
	| 'wing_length'
	| 'weight'
	| 'moult_code';

type EncounterColumn = {
	key: EncounterColumnKey;
	label: string;
	// Primitive used for sorting.
	sortValue: (encounter: SessionEncounter) => string | number | null;
	// Cell content — the single source of truth for how each column renders.
	renderCell: (encounter: SessionEncounter) => React.ReactNode;
};

// Full ordered column list. Species sits after Ring No / before Type, matching
// the current net-rounds table.
const ALL_COLUMNS: EncounterColumn[] = [
	{
		key: 'capture_time',
		label: 'Time',
		sortValue: (encounter) => encounter.capture_time,
		renderCell: (encounter) => encounter.capture_time
	},
	{
		key: 'ring_no',
		label: 'Ring No',
		sortValue: (encounter) => encounter.bird.ring_no,
		renderCell: (encounter) => (
			<NoPrefetchLink className="link" href={`/bird/${encounter.bird.ring_no}`}>
				{encounter.bird.ring_no}
			</NoPrefetchLink>
		)
	},
	{
		key: 'species',
		label: 'Species',
		sortValue: (encounter) => encounter.bird.species.species_name,
		renderCell: (encounter) => encounter.bird.species.species_name
	},
	{
		key: 'record_type',
		label: 'Type',
		sortValue: (encounter) => encounter.record_type,
		renderCell: (encounter) => encounter.record_type
	},
	{
		key: 'age_code',
		label: 'Age',
		sortValue: (encounter) => encounter.age_code,
		renderCell: (encounter) => encounter.age_code
	},
	{
		key: 'proven_age',
		label: 'Proven Age',
		sortValue: (encounter) => encounter.bird.proven_age,
		renderCell: (encounter) => encounter.bird.proven_age
	},
	{
		key: 'sex',
		label: 'Sex',
		sortValue: (encounter) => encounter.sex,
		renderCell: (encounter) => encounter.sex
	},
	{
		key: 'sexing_method',
		label: 'Sexing Method',
		sortValue: (encounter) => encounter.sexing_method,
		renderCell: (encounter) => encounter.sexing_method
	},
	{
		key: 'breeding_condition',
		label: 'Breeding Condition',
		sortValue: (encounter) => encounter.breeding_condition,
		renderCell: (encounter) => encounter.breeding_condition
	},
	{
		key: 'wing_length',
		label: 'Wing',
		sortValue: (encounter) => encounter.wing_length,
		renderCell: (encounter) => encounter.wing_length
	},
	{
		key: 'weight',
		label: 'Weight',
		sortValue: (encounter) => encounter.weight,
		renderCell: (encounter) => encounter.weight
	},
	{
		key: 'moult_code',
		label: 'Moult Code',
		sortValue: (encounter) => encounter.moult_code,
		renderCell: (encounter) => encounter.moult_code
	}
];

function getShownColumns(
	showTimeColumn: boolean,
	showSpeciesColumn: boolean
): EncounterColumn[] {
	return ALL_COLUMNS.filter((column) => {
		if (column.key === 'capture_time') return showTimeColumn;
		if (column.key === 'species') return showSpeciesColumn;
		return true;
	});
}

// The shared per-encounter cell renderer.
function EncounterCells({
	encounter,
	columns
}: {
	encounter: SessionEncounter;
	columns: EncounterColumn[];
}) {
	return (
		<>
			{columns.map((column) => (
				<td key={column.key}>{column.renderCell(encounter)}</td>
			))}
		</>
	);
}

// RowModel driving SortableTable's sorting — one sort value per column key.
// Cells still render from the raw encounter.
type EncounterRowModel = Record<EncounterColumnKey, string | number | null>;

export function EncountersTable({
	encounters,
	size = 'xs',
	showTimeColumn = true,
	showSpeciesColumn = false,
	testId
}: EncountersTableProps) {
	const columns = getShownColumns(showTimeColumn, showSpeciesColumn);

	// Only the shown columns get a config, so only they render as headers.
	const columnConfigs = Object.fromEntries(
		columns.map((column) => [column.key, { label: column.label }])
	) as Partial<Record<EncounterColumnKey, ColumnConfig>>;

	const rowDataTransform = (encounter: SessionEncounter): EncounterRowModel =>
		Object.fromEntries(
			columns.map((column) => [column.key, column.sortValue(encounter)])
		) as EncounterRowModel;

	function EncountersTableBody({
		data
	}: {
		data: RowModelWithRawData<SessionEncounter, EncounterRowModel>[];
	}) {
		return (
			<tbody>
				{data.map((model) => (
					<tr key={model._rawRowData.id}>
						<EncounterCells encounter={model._rawRowData} columns={columns} />
					</tr>
				))}
			</tbody>
		);
	}

	return (
		<SortableTable<SessionEncounter, EncounterRowModel>
			columnConfigs={columnConfigs}
			data={encounters}
			rowDataTransform={rowDataTransform}
			testId={testId}
			className={size === 'xs' ? 'table table-xs' : undefined}
			TableBodyComponent={EncountersTableBody}
		/>
	);
}
