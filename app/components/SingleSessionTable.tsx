'use client';

import { type SessionEncounter } from '@/app/models/session';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { InlineTable } from './shared/DesignSystem';
import { AccordionTableBody } from './shared/AccordionTableBody';
export type SpeciesWithEncounters = {
	species: string;
	encounters: SessionEncounter[];
};
import {
	type ColumnConfig,
	SortableTable,
	type RowModelWithRawData
} from './shared/SortableTable';

function SpeciesNameCell({
	model: { species }
}: {
	model: RowModelWithRawData<SpeciesWithEncounters, RowModel>;
}) {
	return (
		<NoPrefetchLink className="link text-wrap" href={`/species/${species}`}>
			{species}
		</NoPrefetchLink>
	);
}

function SpeciesDetailsTable({
	model: {
		_rawRowData: { encounters }
	}
}: {
	model: RowModelWithRawData<SpeciesWithEncounters, RowModel>;
}) {
	return (
		<InlineTable>
			<thead>
				<tr>
					<th>Time</th>
					<th>Ring No</th>
					<th>Type</th>
					<th>Age</th>
					<th>Sex</th>
					<th>Wing</th>
					<th>Weight</th>
				</tr>
			</thead>
			<tbody>
				{encounters.map((encounter) => (
					<tr key={encounter.id}>
						<td>{encounter.capture_time}</td>
						<td>
							<NoPrefetchLink className="link" href={`/bird/${encounter.bird.ring_no}`}>
								{encounter.bird.ring_no}
							</NoPrefetchLink>
						</td>
						<td>{encounter.record_type}</td>
						<td>{encounter.age_code}</td>
						<td>{encounter.sex}</td>
						<td>{encounter.wing_length}</td>
						<td>{encounter.weight}</td>
					</tr>
				))}
			</tbody>
		</InlineTable>
	);
}

type RowModel = {
	species: string;
	total: number;
	new: number;
	retraps: number;
	adults: number;
	juvs: number;
};

function rowDataTransform(data: SpeciesWithEncounters): RowModel {
	return {
		species: data.species,
		total: data.encounters.length,
		new: data.encounters.filter((encounter) => encounter.record_type === 'N')
			.length,
		retraps: data.encounters.filter(
			(encounter) => encounter.record_type === 'S'
		).length,
		adults: data.encounters.filter((encounter) => encounter.minimum_years >= 1)
			.length,
		juvs: data.encounters.filter((encounter) => encounter.minimum_years === 0)
			.length
	};
}

const columnConfigs = {
	species: {
		label: 'Species',
		invertSort: true
	},
	total: {
		label: 'Total'
	},
	new: {
		label: 'New'
	},
	retraps: {
		label: 'Retraps'
	},
	adults: {
		label: 'Adults'
	},
	juvs: {
		label: 'Juvs'
	}
} as Record<keyof RowModel, ColumnConfig>;

const orderedColumnProperties = Object.keys(
	columnConfigs
) as (keyof RowModel)[];

function SpeciesRow({ model }: { model: RowModel }) {
	return orderedColumnProperties
		.slice(1)
		.map((prop) => <td key={prop}>{model[prop]}</td>);
}

function SessionTableBody({
	data
}: {
	data: RowModelWithRawData<SpeciesWithEncounters, RowModel>[];
}) {
	return (
		<AccordionTableBody<RowModelWithRawData<SpeciesWithEncounters, RowModel>>
			data={data}
			getKey={(speciesWithEncounters) => speciesWithEncounters.species}
			columnCount={5}
			FirstColumnComponent={SpeciesNameCell}
			RestColumnsComponent={SpeciesRow}
			ExpandedContentComponent={SpeciesDetailsTable}
		/>
	);
}

export function SessionTable({
	speciesList
}: {
	speciesList: SpeciesWithEncounters[];
}) {
	return (
		<SortableTable<SpeciesWithEncounters, RowModel>
			columnConfigs={columnConfigs}
			data={speciesList}
			testId="session-table"
			initialSortColumn="total"
			rowDataTransform={rowDataTransform}
			TableBodyComponent={SessionTableBody}
		/>
	);
}
