'use client';

import type { AggregateStatsResult } from '@/app/models/db';
import {
	derivePeriodTotalsRow,
	formatPeriodTotalsLabel,
	type PeriodTotalsGrouping,
	type PeriodTotalsRow
} from '@/app/models/period-totals';
import {
	SortableTable,
	type ColumnConfig,
	type RowModelWithRawData
} from './shared/SortableTable';
import {
	buildStandardColumnConfigs,
	columnBlock,
	createNameLinkCell
} from './shared/StatsTableColumnConfigs';

function buildColumnConfigs(
	firstColumnHeader: string
): Partial<Record<keyof PeriodTotalsRow, ColumnConfig>> {
	return {
		timePeriod: {
			label: firstColumnHeader,
			invertSort: true
		},
		speciesCount: { label: 'Species' },
		encounterCount: { label: 'Encounters' },
		individualsCount: { label: 'Individuals' },
		...buildStandardColumnConfigs<PeriodTotalsRow>(true, {
			new: 'New',
			retraps: 'Retraps',
			pullus: 'Pullus',
			juvs: 'Juvs',
			postjuv: 'Postjuv',
			adults: 'Adults',
			unknownAge: 'Unknown age'
		}),
		newYoung: {
			label: 'New young',
			...columnBlock('bg-lime-50')
		}
	};
}

export function PeriodTotalsTable({
	grouping,
	rows,
	firstColumnHeader,
	buildHref
}: {
	grouping: PeriodTotalsGrouping;
	rows: AggregateStatsResult[];
	firstColumnHeader: string;
	buildHref: (timePeriod: string) => string;
}) {
	if (rows.length === 0) {
		return <p>No data recorded.</p>;
	}

	const columnConfigs = buildColumnConfigs(firstColumnHeader);

	// Recreated each render since `grouping`/`buildHref` are props, not static
	// — the cell itself is stateless, so this only costs identity, not
	// behaviour.
	const PeriodLabelCell = createNameLinkCell<
		AggregateStatsResult,
		PeriodTotalsRow
	>(
		(model) => formatPeriodTotalsLabel(grouping, model.timePeriod),
		(model) => buildHref(model.timePeriod)
	);

	function PeriodTotalsTableBody({
		data,
		columnConfigs
	}: {
		data: RowModelWithRawData<AggregateStatsResult, PeriodTotalsRow>[];
		columnConfigs?: Partial<Record<keyof PeriodTotalsRow, ColumnConfig>>;
	}) {
		const restColumnProperties = Object.keys(columnConfigs ?? {}).filter(
			(property) => property !== 'timePeriod'
		) as (keyof PeriodTotalsRow)[];

		return (
			<tbody>
				{data.map((row) => (
					<tr key={row.timePeriod}>
						<td>
							<PeriodLabelCell model={row} />
						</td>
						{restColumnProperties.map((property) => (
							<td
								key={property}
								className={columnConfigs?.[property]?.cellClassName}
							>
								{row[property]}
							</td>
						))}
					</tr>
				))}
			</tbody>
		);
	}

	return (
		<SortableTable<AggregateStatsResult, PeriodTotalsRow>
			columnConfigs={columnConfigs}
			data={rows}
			testId="period-totals-table"
			rowDataTransform={derivePeriodTotalsRow}
			TableBodyComponent={PeriodTotalsTableBody}
		/>
	);
}
