'use client';
import { PulliEncounter } from '@/app/models/session';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { format as formatDate } from 'date-fns';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import {
	SortableTable,
	type ColumnConfig,
	type RowModelWithRawData,
	getFormattedValue
} from '@/app/components/shared/SortableTable';

type PulliRowModel = {
	ringNo: string;
	speciesName: string;
	visitDate: Date;
	locationName: string;
	notes: string | null;
};

function dateFormatter(value: unknown): string {
	return formatDate(value as Date, 'dd MMM yyyy');
}

function notesFormatter(value: unknown): string {
	return (value as string | null) ?? '–';
}

const columnConfigs = {
	ringNo: {
		label: 'Ring',
		invertSort: true
	},
	speciesName: {
		label: 'Species',
		invertSort: true
	},
	visitDate: {
		label: 'Visit date',
		formatter: dateFormatter
	},
	locationName: {
		label: 'Location',
		invertSort: true
	},
	notes: {
		label: 'Notes',
		invertSort: true,
		formatter: notesFormatter
	}
} as Record<keyof PulliRowModel, ColumnConfig>;

const cellFormatter = getFormattedValue<PulliRowModel>(columnConfigs);

function rowDataTransform(encounter: PulliEncounter): PulliRowModel {
	return {
		ringNo: encounter.bird.ring_no,
		speciesName: encounter.bird.species.species_name,
		visitDate: new Date(encounter.session.visit_date),
		locationName: encounter.session.location.location_name,
		notes: encounter.extra_text
	};
}

function RingCell({
	model
}: {
	model: RowModelWithRawData<PulliEncounter, PulliRowModel>;
}) {
	return (
		<NoPrefetchLink className="link" href={`/bird/${model.ringNo}`}>
			{model.ringNo}
		</NoPrefetchLink>
	);
}

function PulliEncountersTableBody({
	data
}: {
	data: RowModelWithRawData<PulliEncounter, PulliRowModel>[];
}) {
	return (
		<tbody>
			{data.map((row) => (
				<tr key={row._rawRowData.id}>
					<td>
						<RingCell model={row} />
					</td>
					<td>{row.speciesName}</td>
					<td>{cellFormatter(row.visitDate, 'visitDate')}</td>
					<td>{row.locationName}</td>
					<td>{cellFormatter(row.notes, 'notes')}</td>
				</tr>
			))}
		</tbody>
	);
}

export function PulliEncountersTable({ data }: { data: PulliEncounter[] }) {
	return (
		<SortableTable<PulliEncounter, PulliRowModel>
			columnConfigs={columnConfigs}
			data={data}
			initialSortColumn="visitDate"
			rowDataTransform={rowDataTransform}
			TableBodyComponent={PulliEncountersTableBody}
		/>
	);
}

export function PulliPageContent({ data }: { data: PulliEncounter[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Pulli</PrimaryHeading>
			<PulliEncountersTable data={data} />
		</PageWrapper>
	);
}
