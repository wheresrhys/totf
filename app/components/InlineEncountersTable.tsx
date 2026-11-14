'use client';
import { format as formatDate } from 'date-fns';
import type { EncounterOfBird } from '@/app/models/bird';
import {
	InlineTable,
	type ColumnConfig,
	getFormattedValue
} from '@/modules/ui-kit';

type RowModel = {
	visit_date: Date;
	capture_time: string;
	age_code: string;
	sex: string;
	sexing_method: string | null;
	breeding_condition: string | null;
	wing_length: number | null;
	weight: number | null;
	moult_code: string | null;
};

function rowDataTransform(encounter: EncounterOfBird): RowModel {
	return {
		visit_date: new Date(encounter.session.visit_date),
		capture_time: encounter.capture_time,
		age_code: `${encounter.age_code}${encounter.is_juv ? 'J' : ''}`,
		sex: encounter.sex,
		sexing_method: encounter.sexing_method,
		breeding_condition: encounter.breeding_condition,
		wing_length: encounter.wing_length,
		weight: encounter.weight,
		moult_code: encounter.moult_code
	};
}

function dateFormatter(date: Date): string {
	return formatDate(date, 'dd MMM yyyy');
}
const columnConfigs = {
	visit_date: {
		label: 'Date',
		formatter: dateFormatter
	},
	capture_time: {
		label: 'Time'
	},
	age_code: {
		label: 'Age'
	},
	sex: {
		label: 'Sex'
	},
	sexing_method: {
		label: 'Sexing Method'
	},
	breeding_condition: {
		label: 'Breeding Condition'
	},
	wing_length: {
		label: 'Wing'
	},
	weight: {
		label: 'Weight'
	},
	moult_code: {
		label: 'Moult Code'
	}
} as Record<keyof RowModel, ColumnConfig>;

const cellFormatter = getFormattedValue<RowModel>(columnConfigs);

const orderedColumnProperties = Object.keys(
	columnConfigs
) as (keyof RowModel)[];

export function InlineEncountersTable({
	encounters,
	highlightRow
}: {
	encounters: EncounterOfBird[];
	highlightRow?: (encounter: EncounterOfBird) => boolean;
}) {
	return (
		<InlineTable testId="single-bird-table">
			<thead>
				<tr>
					{orderedColumnProperties.map((property) => (
						<th key={property}>{columnConfigs[property].label}</th>
					))}
				</tr>
			</thead>
			<tbody>
				{encounters.map((encounter) => {
					const rowModel = rowDataTransform(encounter);
					const isHighlighted = highlightRow?.(encounter) ?? false;
					return (
						<tr
							key={encounter.id}
							className={isHighlighted ? 'bg-warning/20' : undefined}
						>
							{orderedColumnProperties.map((property) => (
								<td key={property}>
									{cellFormatter(rowModel[property], property)}
								</td>
							))}
						</tr>
					);
				})}
			</tbody>
		</InlineTable>
	);
}
