'use client';
import { useState, useEffect } from 'react';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { AccordionTableBody } from '@/app/components/shared/AccordionTableBody';
import { SingleBirdTable } from '@/app/components/SingleBirdTable';
import { fetchBirdEncounters } from '@/app/actions/bird-encounters';
import type { DiscrepenciesResult } from '@/app/models/db';
import type { EncounterOfBird } from '@/app/models/bird';
import type { RowModelWithRawData } from '@/app/components/shared/SortableTable';

type MistakesRowModel = {
	ringNo: string;
	speciesName: string;
};

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

function makeHighlighter(
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
		return (enc) => {
			if (enc.wing_length == null) return false;
			const w = enc.wing_length;
			const otherMeasured = encounters
				.filter((other) => other !== enc && other.wing_length != null)
				.map((other) => other.wing_length as number);
			const diffCount = otherMeasured.filter(
				(m) => Math.abs(m - w) >= 5
			).length;
			return diffCount > otherMeasured.length / 2;
		};
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
	return <td>{model.speciesName}</td>;
}

function MistakesDiscrepancyTable({
	mistakes
}: {
	mistakes: DiscrepenciesResult[];
}) {
	const data: RowModelWithRawData<DiscrepenciesResult, MistakesRowModel>[] =
		mistakes.map((mistake) => ({
			ringNo: mistake.ring_no,
			speciesName: mistake.species_name,
			_rawRowData: mistake
		}));

	return (
		<table className="table">
			<thead>
				<tr>
					<th>Bird</th>
					<th>Species</th>
				</tr>
			</thead>
			<AccordionTableBody
				data={data}
				getKey={(item) => item.ringNo}
				columnCount={2}
				FirstColumnComponent={RingCell}
				RestColumnsComponent={RestColumns}
				ExpandedContentComponent={LazyBirdDetail}
			/>
		</table>
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
			<nav
				className="bg-base-200 rounded-field w-fit space-x-1 overflow-x-auto p-1 mt-4"
				aria-label="Tabs"
				role="tablist"
				aria-orientation="horizontal"
			>
				{discrepancyTypes.map((type) => (
					<button
						key={type}
						type="button"
						className={`btn ${activeTab === type ? 'btn-default' : 'btn-secondary'}`}
						onClick={() => setActiveTab(type)}
					>
						{formatTabLabel(type)}
					</button>
				))}
			</nav>
			{discrepancyTypes.map((type) =>
				type === activeTab ? (
					<MistakesDiscrepancyTable key={type} mistakes={grouped[type]} />
				) : null
			)}
		</>
	);
}
