'use client';

import { formatSecondsForDisplay } from '@/lib/postgres-interval';
import type { AggregateStatsResult } from '@/app/models/db';
import {
	derivePeriodTotalsRow,
	formatPeriodTotalsLabel,
	type PeriodTotalsGrouping,
	type PeriodTotalsRow
} from '@/app/models/period-totals';
import {
	SortableTable,
	getFormattedValue,
	type ColumnConfig,
	type RowModelWithRawData
} from './shared/SortableTable';
import {
	buildSessionsColumnConfig,
	buildStandardColumnConfigs,
	buildTotalsRowCells,
	columnBlock,
	createNameLinkCell
} from './shared/StatsTableColumnConfigs';

function buildColumnConfigs(
	firstColumnHeader: string,
	hasPullus: boolean
): Partial<Record<keyof PeriodTotalsRow, ColumnConfig>> {
	return {
		timePeriod: {
			label: firstColumnHeader,
			invertSort: true
		},
		...buildSessionsColumnConfig<PeriodTotalsRow>('sessionsCount', 'Sessions'),
		effortSeconds: {
			label: 'Effort',
			formatter: (value) => formatSecondsForDisplay(value as number)
		},
		speciesCount: { label: 'Species' },
		encounterCount: { label: 'Encounters' },
		individualsCount: { label: 'Individuals' },
		...buildStandardColumnConfigs<PeriodTotalsRow>(hasPullus),
		newYoung: {
			label: 'New young',
			...columnBlock('lime')
		}
	};
}

export function PeriodTotalsTable({
	grouping,
	rows,
	firstColumnHeader,
	buildHref,
	buildLabel,
	totalsStats
}: {
	grouping: PeriodTotalsGrouping;
	rows: AggregateStatsResult[];
	firstColumnHeader: string;
	buildHref: (timePeriod: string) => string;
	// Overrides the default `formatPeriodTotalsLabel(grouping, ...)` first-column
	// text — e.g. the month-totals caller supplies a timezone-safe label built
	// from integer year/month rather than parsing the `time_period` string.
	buildLabel?: (timePeriod: string) => string;
	totalsStats?: AggregateStatsResult;
}) {
	if (rows.length === 0) {
		return <p>No data recorded.</p>;
	}

	const resolveLabel =
		buildLabel ??
		((timePeriod: string) => formatPeriodTotalsLabel(grouping, timePeriod));
	const hasPullus = rows.some((stat) => stat.pullus_count > 0);
	const columnConfigs = buildColumnConfigs(firstColumnHeader, hasPullus);

	const totalsRow = totalsStats
		? buildTotalsRowCells<PeriodTotalsRow>({
				columnConfigs,
				totalsRowModel: derivePeriodTotalsRow(totalsStats)
			})
		: undefined;

	// Recreated each render since `grouping`/`buildHref` are props, not static
	// — the cell itself is stateless, so this only costs identity, not
	// behaviour.
	const PeriodLabelCell = createNameLinkCell<
		AggregateStatsResult,
		PeriodTotalsRow
	>(
		(model) => resolveLabel(model.timePeriod),
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
		const cellFormatter = getFormattedValue<PeriodTotalsRow>(
			columnConfigs ?? {}
		);

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
								{cellFormatter(row[property], property)}
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
			totalsRow={totalsRow}
			TableBodyComponent={PeriodTotalsTableBody}
		/>
	);
}
