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
		...buildSessionsColumnConfig<PeriodTotalsRow>('sessionsCount', 'Sessions'),
		effortSeconds: {
			label: 'Effort',
			formatter: (value) => formatSecondsForDisplay(value as number)
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
	buildHref,
	buildLabel
}: {
	grouping: PeriodTotalsGrouping;
	rows: AggregateStatsResult[];
	firstColumnHeader: string;
	buildHref: (timePeriod: string) => string;
	// Overrides the default `formatPeriodTotalsLabel(grouping, ...)` first-column
	// text — e.g. the month-totals caller supplies a timezone-safe label built
	// from integer year/month rather than parsing the `time_period` string.
	buildLabel?: (timePeriod: string) => string;
}) {
	if (rows.length === 0) {
		return <p>No data recorded.</p>;
	}

	const resolveLabel =
		buildLabel ??
		((timePeriod: string) => formatPeriodTotalsLabel(grouping, timePeriod));

	const columnConfigs = buildColumnConfigs(firstColumnHeader);

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
			TableBodyComponent={PeriodTotalsTableBody}
		/>
	);
}
