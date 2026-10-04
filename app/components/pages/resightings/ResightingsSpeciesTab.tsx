'use client';
import { format as formatDate } from 'date-fns';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import type { ResightingEncounter } from '@/app/models/session';
import {
	SortableTable,
	type ColumnConfig,
	type RowModelWithRawData,
	getFormattedValue
} from '@/app/components/shared/SortableTable';
import { groupResightingsBySpecies } from '@/app/lib/resightings';

type ResightingsRowModel = {
	ringNo: string;
	speciesName: string;
	visitDate: Date;
	locationName: string;
	recordType: string;
	notes: string | null;
	findingCondition: string | null;
	findingCircumstances: string | null;
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
		preferSortAscending: true
	},
	speciesName: {
		label: 'Species',
		preferSortAscending: true
	},
	visitDate: {
		label: 'Visit date',
		formatter: dateFormatter
	},
	locationName: {
		label: 'Location',
		preferSortAscending: true
	},
	recordType: {
		label: 'Type',
		preferSortAscending: true
	},
	notes: {
		label: 'Notes',
		preferSortAscending: true,
		formatter: notesFormatter
	},
	findingCondition: {
		label: 'Finding condition',
		preferSortAscending: true,
		formatter: notesFormatter
	},
	findingCircumstances: {
		label: 'Finding circumstances',
		preferSortAscending: true,
		formatter: notesFormatter
	}
} as Record<keyof ResightingsRowModel, ColumnConfig>;

const cellFormatter = getFormattedValue<ResightingsRowModel>(columnConfigs);

function rowDataTransform(
	resighting: ResightingEncounter
): ResightingsRowModel {
	return {
		ringNo: resighting.bird.ring_no,
		speciesName: resighting.bird.species.species_name,
		visitDate: new Date(resighting.visit_date),
		locationName: resighting.location.location_name,
		recordType: resighting.record_type,
		notes: resighting.extra_text,
		findingCondition: resighting.finding_condition,
		findingCircumstances: resighting.finding_circumstances
	};
}

function RingCell({
	model
}: {
	model: RowModelWithRawData<ResightingEncounter, ResightingsRowModel>;
}) {
	return (
		<NoPrefetchLink className="link" href={`/bird/${model.ringNo}`}>
			{model.ringNo}
		</NoPrefetchLink>
	);
}

function ResightingsTableBody({
	data
}: {
	data: RowModelWithRawData<ResightingEncounter, ResightingsRowModel>[];
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
					<td>
						<span className="badge badge-sm badge-outline">
							{row.recordType}
						</span>
					</td>
					<td>{cellFormatter(row.notes, 'notes')}</td>
					<td>{cellFormatter(row.findingCondition, 'findingCondition')}</td>
					<td>
						{cellFormatter(row.findingCircumstances, 'findingCircumstances')}
					</td>
				</tr>
			))}
		</tbody>
	);
}

function ResightingsDataTable({
	resightings
}: {
	resightings: ResightingEncounter[];
}) {
	return (
		<SortableTable<ResightingEncounter, ResightingsRowModel>
			columnConfigs={columnConfigs}
			data={resightings}
			initialSortColumn="visitDate"
			rowDataTransform={rowDataTransform}
			TableBodyComponent={ResightingsTableBody}
		/>
	);
}

/**
 * One resightings tab: the shared resightings table, narrowed to a single
 * species (or, for `ALL_RESIGHTINGS_TAB_ID`, left unfiltered).
 *
 * One parameterized component rather than one component per species — the tab
 * list is data-driven, so the set of species isn't known until the page's data
 * is fetched. Each tab is handed the page's **full** `ResightingEncounter[]`
 * and does its own filtering, rather than the page pre-slicing the array per
 * tab: filtering an in-memory array is cheap (the same `reduce` the page
 * already runs to derive its tab ids), and it keeps every tab's params
 * identical to the `TabSet`'s shared ones.
 */
export function ResightingsSpeciesTab({
	speciesId,
	resightings
}: {
	speciesId: string;
	resightings: ResightingEncounter[];
}) {
	const resightingsForSpecies =
		groupResightingsBySpecies(resightings)[speciesId] ?? [];
	return <ResightingsDataTable resightings={resightingsForSpecies} />;
}
