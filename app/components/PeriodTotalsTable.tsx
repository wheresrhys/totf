'use client';

import { useState } from 'react';
import { formatSecondsForDisplay } from '@/lib/postgres-interval';
import type { AggregateStatsResult } from '@/app/models/db';
import {
	derivePeriodTotalsRow,
	derivePeriodTotalsRowByEncounter,
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
	buildStandardColumnConfigs,
	buildTotalsRowCells,
	createNameLinkCell
} from './shared/StatsTableColumnConfigs';
import {
	AggregateByToggle,
	type AggregateByValue
} from './shared/AggregateByToggle';

function buildColumnConfigs(
	firstColumnHeader: string,
	hasPulli: boolean,
	dashIndividuals: boolean
): Partial<Record<keyof PeriodTotalsRow, ColumnConfig>> {
	return {
		timePeriod: {
			label: firstColumnHeader,
			invertSort: true
		},
		sessionsCount: {
			label: 'Sessions'
		},
		effortSeconds: {
			label: 'Effort',
			formatter: (value) => formatSecondsForDisplay(value as number)
		},
		speciesCount: { label: 'Species' },
		encounterCount: { label: 'Encounters' },
		// On an encounters-only tab a per-period bird count is meaningless, so
		// the whole column renders a `'-'` placeholder rather than a number.
		individualsCount: {
			label: 'Individuals',
			...(dashIndividuals ? { formatter: () => '-' } : {})
		},
		...buildStandardColumnConfigs<PeriodTotalsRow>(hasPulli)
	};
}

export function PeriodTotalsTable({
	grouping,
	rows,
	firstColumnHeader,
	buildHref,
	buildLabel,
	totalsStats,
	aggregationFixedTo,
	dashIndividuals = false
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
	// When set, aggregation is locked to this value and the Bird/Encounter toggle
	// still renders but is disabled — the all-time "Month totals" tab fixes it to
	// `'encounter'`, since combine-years bird counts aren't meaningful.
	aggregationFixedTo?: AggregateByValue;
	// Renders every Individuals cell (data rows and the totals row) as `'-'`.
	dashIndividuals?: boolean;
}) {
	// Local to this table (not persisted across tab switches) — resets to
	// 'bird' whenever `SummaryTotalsSection` remounts this table for a
	// different tab, per #604. Ignored when `aggregationFixedTo` locks the mode.
	const [aggregateByState, setAggregateBy] = useState<AggregateByValue>('bird');
	const aggregateBy = aggregationFixedTo ?? aggregateByState;

	if (rows.length === 0) {
		return <p>No data recorded.</p>;
	}

	const activeDeriveRow =
		aggregateBy === 'bird'
			? derivePeriodTotalsRow
			: derivePeriodTotalsRowByEncounter;

	const resolveLabel =
		buildLabel ??
		((timePeriod: string) => formatPeriodTotalsLabel(grouping, timePeriod));
	const hasPulli = rows.some((stat) => activeDeriveRow(stat).pullus > 0);
	const columnConfigs = buildColumnConfigs(
		firstColumnHeader,
		hasPulli,
		dashIndividuals
	);

	const totalsRow = totalsStats
		? buildTotalsRowCells<PeriodTotalsRow>({
				columnConfigs,
				totalsRowModel: activeDeriveRow(totalsStats),
				...(dashIndividuals ? { cellOverrides: { individualsCount: '-' } } : {})
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
			rowDataTransform={activeDeriveRow}
			totalsRow={totalsRow}
			aboveHeaderRow={{
				spanFromColumn: 'new',
				spanToColumn: 'unknownAge',
				content: (
					<AggregateByToggle
						value={aggregateBy}
						onChange={setAggregateBy}
						disabled={aggregationFixedTo !== undefined}
					/>
				)
			}}
			TableBodyComponent={PeriodTotalsTableBody}
		/>
	);
}
