'use client';
import { format as formatDate } from 'date-fns';
import type { EncounterOfBird } from '@/app/models/bird';
import {
	SortableTable,
	getFormattedValue,
	type ColumnConfig,
	type RowModelWithRawData
} from '@/modules/ui-kit';

// The bird page's own, richer encounters table — a SortableTable-backed
// counterpart to InlineEncountersTable's compact, non-sortable 9-column view
// (app/components/InlineEncountersTable.tsx), used only here. Column config +
// getFormattedValue is the same shape InlineEncountersTable and
// modules/stats-view/components/SpTable.tsx already use; the three merged
// columns (Age, Sex, Moult) bypass that generic single-value formatter via
// customCellRenderers, the same way SpTable special-cases its wing/weight
// range columns.

type RowModel = {
	visit_date: Date;
	capture_time: string;
	age: string;
	sex: string;
	wing_length: number | null;
	weight: number | null;
	breeding_condition: string | null;
	moult_code: string | null;
	old_greater_coverts: number | null;
	fat: string | null;
	pectoral_muscle: number | null;
	extra_text: string | null;
};

function dateFormatter(date: Date): string {
	return formatDate(date, 'dd MMM yyyy');
}

function rowDataTransform(encounter: EncounterOfBird): RowModel {
	return {
		visit_date: new Date(encounter.session.visit_date),
		capture_time: encounter.capture_time,
		age: `${encounter.age_code}${encounter.is_juv ? 'J' : ''}`,
		sex: encounter.sex,
		wing_length: encounter.wing_length,
		weight: encounter.weight,
		breeding_condition: encounter.breeding_condition,
		moult_code: encounter.moult_code,
		old_greater_coverts: encounter.old_greater_coverts,
		fat: encounter.fat,
		pectoral_muscle: encounter.pectoral_muscle,
		extra_text: encounter.extra_text
	};
}

const columnConfigs = {
	visit_date: {
		label: 'Date',
		formatter: dateFormatter
	},
	capture_time: {
		label: 'Time'
	},
	age: {
		label: 'Age'
	},
	sex: {
		label: 'Sex'
	},
	wing_length: {
		label: 'Wing'
	},
	weight: {
		label: 'Weight'
	},
	breeding_condition: {
		label: 'Breeding Condition'
	},
	moult_code: {
		label: 'Moult'
	},
	old_greater_coverts: {
		label: 'OGC'
	},
	fat: {
		label: 'Fat'
	},
	pectoral_muscle: {
		label: 'Pectoral Muscle'
	},
	extra_text: {
		label: 'Notes'
	}
} as Record<keyof RowModel, ColumnConfig>;

const orderedColumnProperties = Object.keys(
	columnConfigs
) as (keyof RowModel)[];

const cellFormatter = getFormattedValue<RowModel>(columnConfigs);

// sex + sexing_method merged into one cell: "M (plumage)", or just "M" when
// sexing_method is null/absent — never an empty trailing "()".
function SexCell({ encounter }: { encounter: EncounterOfBird }) {
	return (
		<>
			{encounter.sex}
			{encounter.sexing_method ? ` (${encounter.sexing_method})` : ''}
		</>
	);
}

// moult_code on its own line, primary_moult beneath it in smaller, muted
// text — omitted entirely (not an empty line) when primary_moult is null.
function MoultCell({ encounter }: { encounter: EncounterOfBird }) {
	return (
		<>
			<div>{encounter.moult_code}</div>
			{encounter.primary_moult ? (
				<div className="text-xs text-base-content/60">
					{encounter.primary_moult}
				</div>
			) : null}
		</>
	);
}

// Properties whose cell content is derived from more than one raw field, so
// they bypass cellFormatter (which only ever sees one RowModel value) and
// render straight from the raw encounter instead — the same bypass-by-property
// pattern SpTable uses for its wing/weight range columns.
const customCellRenderers: Partial<
	Record<keyof RowModel, (encounter: EncounterOfBird) => React.ReactNode>
> = {
	sex: (encounter) => <SexCell encounter={encounter} />,
	moult_code: (encounter) => <MoultCell encounter={encounter} />
};

function EncountersTableBody({
	data
}: {
	data: RowModelWithRawData<EncounterOfBird, RowModel>[];
}) {
	return (
		<tbody>
			{data.map((rowModel) => (
				<tr key={rowModel._rawRowData.id}>
					{orderedColumnProperties.map((property) => {
						const customRenderer = customCellRenderers[property];
						return (
							<td key={property}>
								{customRenderer
									? customRenderer(rowModel._rawRowData)
									: cellFormatter(rowModel[property], property)}
							</td>
						);
					})}
				</tr>
			))}
		</tbody>
	);
}

export function EncountersTable({
	encounters
}: {
	encounters: EncounterOfBird[];
}) {
	return (
		<SortableTable<EncounterOfBird, RowModel>
			columnConfigs={columnConfigs}
			data={encounters}
			testId="bird-encounters-table"
			rowDataTransform={rowDataTransform}
			TableBodyComponent={EncountersTableBody}
		/>
	);
}
