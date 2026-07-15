'use client';
import { useState, useEffect } from 'react';
import { format as formatDate } from 'date-fns';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { AccordionTableBody } from '@/app/components/shared/AccordionTableBody';
import { SingleBirdTable } from '@/app/components/SingleBirdTable';
import { fetchBirdEncounters } from '@/app/actions/bird-encounters';
import type { DiscrepenciesResult } from '@/app/models/db';
import type { EncounterOfBird } from '@/app/models/bird';
import {
	SortableTable,
	type ColumnConfig,
	type RowModelWithRawData,
	getFormattedValue
} from '@/app/components/shared/SortableTable';
import { TabNav } from '@/app/components/TabNav';

type MistakesRowModel = {
	ringNo: string;
	speciesName: string;
	lastEncounterDate: Date;
};

function dateFormatter(value: unknown): string {
	return formatDate(value as Date, 'dd MMM yyyy');
}

const columnConfigs = {
	ringNo: {
		label: 'Bird',
		invertSort: true
	},
	speciesName: {
		label: 'Species',
		invertSort: true
	},
	lastEncounterDate: {
		label: 'Last seen',
		formatter: dateFormatter
	}
} as Record<keyof MistakesRowModel, ColumnConfig>;

const cellFormatter = getFormattedValue<MistakesRowModel>(columnConfigs);

function formatTabLabel(discrepancyType: string): string {
	const withSpaces = discrepancyType.replace(/_/g, ' ');
	return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function groupByDiscrepancyType(
	mistakes: DiscrepenciesResult[]
): Record<string, DiscrepenciesResult[]> {
	return mistakes.reduce<Record<string, DiscrepenciesResult[]>>(
		(grouped, mistake) => {
			const type = mistake.discrepency_type;
			if (!grouped[type]) {
				grouped[type] = [];
			}
			grouped[type].push(mistake);
			return grouped;
		},
		{}
	);
}

export function makeHighlighter(
	discrepancyType: string,
	encounters: EncounterOfBird[]
): (encounter: EncounterOfBird) => boolean {
	if (discrepancyType === 'sex') {
		return (enc) => !!enc.sex && enc.sex.toLowerCase() !== 'u';
	}
	if (discrepancyType === 'age') {
		return (enc) => enc.age_code != null && enc.age_code >= 2;
	}
	if (discrepancyType === 'wing_length') {
		const measured = encounters
			.filter((e) => e.wing_length != null)
			.map((e) => e.wing_length as number)
			.sort((a, b) => a - b);
		if (measured.length === 0) return () => false;
		const mid = Math.floor(measured.length / 2);
		const median =
			measured.length % 2 === 0
				? (measured[mid - 1] + measured[mid]) / 2
				: measured[mid];
		const maxDist = Math.max(...measured.map((m) => Math.abs(m - median)));
		return (enc) =>
			enc.wing_length != null && Math.abs(enc.wing_length - median) === maxDist;
	}
	return () => false;
}

function LazyBirdDetail({
	model
}: {
	model: RowModelWithRawData<DiscrepenciesResult, MistakesRowModel>;
}) {
	const [encounters, setEncounters] = useState<EncounterOfBird[] | null>(null);
	const { ring_no, discrepency_type } = model._rawRowData;

	useEffect(() => {
		fetchBirdEncounters(ring_no).then(setEncounters);
	}, [ring_no]);

	if (!encounters) {
		return <p>Loading...</p>;
	}

	return (
		<SingleBirdTable
			encounters={encounters}
			isInline={true}
			highlightRow={makeHighlighter(discrepency_type, encounters)}
		/>
	);
}

function RingCell({
	model
}: {
	model: RowModelWithRawData<DiscrepenciesResult, MistakesRowModel>;
}) {
	return (
		<NoPrefetchLink className="link" href={`/bird/${model.ringNo}`}>
			{model.ringNo}
		</NoPrefetchLink>
	);
}

function RestColumns({
	model
}: {
	model: RowModelWithRawData<DiscrepenciesResult, MistakesRowModel>;
}) {
	return (
		<>
			<td>{model.speciesName}</td>
			<td>{cellFormatter(model.lastEncounterDate, 'lastEncounterDate')}</td>
		</>
	);
}

function rowDataTransform(mistake: DiscrepenciesResult): MistakesRowModel {
	return {
		ringNo: mistake.ring_no,
		speciesName: mistake.species_name,
		lastEncounterDate: new Date(mistake.last_encounter_date)
	};
}

function MistakesDiscrepancyTable({
	mistakes
}: {
	mistakes: DiscrepenciesResult[];
}) {
	return (
		<SortableTable<DiscrepenciesResult, MistakesRowModel>
			columnConfigs={columnConfigs}
			data={mistakes}
			initialSortColumn="speciesName"
			rowDataTransform={rowDataTransform}
			TableBodyComponent={({ data }) => (
				<AccordionTableBody<
					RowModelWithRawData<DiscrepenciesResult, MistakesRowModel>
				>
					data={data}
					getKey={(item) => item.ringNo}
					columnCount={Object.keys(columnConfigs).length}
					FirstColumnComponent={RingCell}
					RestColumnsComponent={RestColumns}
					ExpandedContentComponent={LazyBirdDetail}
				/>
			)}
		/>
	);
}

export function MistakesTable({
	mistakes
}: {
	mistakes: DiscrepenciesResult[];
}) {
	const grouped = groupByDiscrepancyType(mistakes);
	const discrepancyTypes = Object.keys(grouped);
	const [activeTab, setActiveTab] = useState(discrepancyTypes[0] ?? '');

	return (
		<>
			<TabNav
				tabs={discrepancyTypes.map((type) => ({
					id: type,
					label: formatTabLabel(type)
				}))}
				activeTab={activeTab}
				onTabChange={setActiveTab}
			/>
			{discrepancyTypes.map((type) =>
				type === activeTab ? (
					<MistakesDiscrepancyTable key={type} mistakes={grouped[type]} />
				) : null
			)}
		</>
	);
}
