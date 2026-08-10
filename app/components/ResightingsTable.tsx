'use client';
import { useState } from 'react';
import { format as formatDate } from 'date-fns';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import type { ResightingEncounter } from '@/app/models/session';
import {
	SortableTable,
	type ColumnConfig,
	type RowModelWithRawData,
	getFormattedValue
} from '@/app/components/shared/SortableTable';
import { TabNav } from '@/app/components/TabNav';

const ALL_TAB = 'All';
const ALL_FILTER_VALUE = 'All';

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

export function getDistinctFieldValues(
	resightings: ResightingEncounter[],
	field: 'finding_condition' | 'finding_circumstances'
): string[] {
	const values = resightings
		.map((resighting) => resighting[field])
		.filter((value): value is string => value !== null);
	return [...new Set(values)].sort();
}

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

function FindingFieldFilter({
	label,
	options,
	value,
	onChange
}: {
	label: string;
	options: string[];
	value: string;
	onChange: (value: string) => void;
}) {
	const id = `${label.toLowerCase().replace(/\s+/g, '-')}-select`;
	return (
		<div className="flex items-center gap-2">
			<label htmlFor={id} className="shrink-0">
				{label}
			</label>
			<select
				id={id}
				className="select max-w-sm appearance-none"
				aria-label={label}
				value={value}
				onChange={(event) => onChange(event.target.value)}
			>
				<option value={ALL_FILTER_VALUE}>All</option>
				{options.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		</div>
	);
}

export function ResightingsTable({
	resightings
}: {
	resightings: ResightingEncounter[];
}) {
	const grouped = groupResightingsBySpecies(resightings);
	const tabs = Object.keys(grouped);
	const [activeTab, setActiveTab] = useState(ALL_TAB);
	const [conditionFilter, setConditionFilter] = useState(ALL_FILTER_VALUE);
	const [circumstancesFilter, setCircumstancesFilter] =
		useState(ALL_FILTER_VALUE);

	const conditionOptions = getDistinctFieldValues(
		resightings,
		'finding_condition'
	);
	const circumstancesOptions = getDistinctFieldValues(
		resightings,
		'finding_circumstances'
	);

	const filteredResightings = grouped[activeTab].filter(
		(resighting) =>
			(conditionFilter === ALL_FILTER_VALUE ||
				resighting.finding_condition === conditionFilter) &&
			(circumstancesFilter === ALL_FILTER_VALUE ||
				resighting.finding_circumstances === circumstancesFilter)
	);

	return (
		<>
			<TabNav
				tabs={tabs.map((tab) => ({ id: tab, label: tab }))}
				activeTab={activeTab}
				onTabChange={setActiveTab}
			/>
			<div className="flex gap-4 flex-wrap mt-4">
				<FindingFieldFilter
					label="Condition"
					options={conditionOptions}
					value={conditionFilter}
					onChange={setConditionFilter}
				/>
				<FindingFieldFilter
					label="Circumstances"
					options={circumstancesOptions}
					value={circumstancesFilter}
					onChange={setCircumstancesFilter}
				/>
			</div>
			<ResightingsDataTable key={activeTab} resightings={filteredResightings} />
		</>
	);
}
