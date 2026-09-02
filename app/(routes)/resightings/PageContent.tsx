'use client';
import { useState } from 'react';
import { format as formatDate } from 'date-fns';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import type { ResightingEncounter } from '@/app/models/session';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import {
	SortableTable,
	type ColumnConfig,
	type RowModelWithRawData,
	getFormattedValue
} from '@/app/components/shared/SortableTable';
import { TabNav } from '@/app/components/TabNav';

const ALL_TAB = 'All';

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
	recordType: {
		label: 'Type',
		invertSort: true
	},
	notes: {
		label: 'Notes',
		invertSort: true,
		formatter: notesFormatter
	},
	findingCondition: {
		label: 'Finding condition',
		invertSort: true,
		formatter: notesFormatter
	},
	findingCircumstances: {
		label: 'Finding circumstances',
		invertSort: true,
		formatter: notesFormatter
	}
} as Record<keyof ResightingsRowModel, ColumnConfig>;

const cellFormatter = getFormattedValue<ResightingsRowModel>(columnConfigs);

export function groupResightingsBySpecies(
	resightings: ResightingEncounter[]
): Record<string, ResightingEncounter[]> {
	return resightings.reduce<Record<string, ResightingEncounter[]>>(
		(grouped, resighting) => {
			const speciesName = resighting.bird.species.species_name;
			if (!grouped[speciesName]) {
				grouped[speciesName] = [];
			}
			grouped[speciesName].push(resighting);
			return grouped;
		},
		{ [ALL_TAB]: [...resightings] }
	);
}

function rowDataTransform(
	resighting: ResightingEncounter
): ResightingsRowModel {
	return {
		ringNo: resighting.bird.ring_no,
		speciesName: resighting.bird.species.species_name,
		visitDate: new Date(resighting.session.visit_date),
		locationName: resighting.session.location.location_name,
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

function ResightingsTable({
	resightings
}: {
	resightings: ResightingEncounter[];
}) {
	const grouped = groupResightingsBySpecies(resightings);
	const tabs = Object.keys(grouped);
	const [activeTab, setActiveTab] = useState(ALL_TAB);

	return (
		<>
			<TabNav
				tabs={tabs.map((tab) => ({ id: tab, label: tab }))}
				activeTab={activeTab}
				onTabChange={setActiveTab}
			/>
			{tabs.map((tab) =>
				tab === activeTab ? (
					<ResightingsDataTable key={tab} resightings={grouped[tab]} />
				) : null
			)}
		</>
	);
}

export function ResightingsPageContent({
	data
}: {
	data: ResightingEncounter[];
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>Resightings</PrimaryHeading>
			<ResightingsTable resightings={data} />
		</PageWrapper>
	);
}
