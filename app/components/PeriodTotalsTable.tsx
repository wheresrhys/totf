'use client';

import { useState } from 'react';
import { formatSecondsForDisplay } from '@/app/lib/postgres-interval';
import type { CoreStatsResult } from '@/app/models/db';
import {
	derivePeriodTotalsRowByBird,
	derivePeriodTotalsRowByEncounter,
	formatPeriodTotalsLabel,
	type PeriodTotalsGrouping,
	type PeriodTotalsRow
} from '@/app/lib/period-totals';
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

function buildColumnConfigs({
	timeInterval,
	firstColumnHeader,
	hasPulli,
	dashIndividuals,
	aggregateBy,
	showSpeciesColumn,
	showBusiestSession
}: {
	timeInterval: PeriodTotalsGrouping;
	firstColumnHeader: string;
	hasPulli: boolean;
	dashIndividuals: boolean;
	aggregateBy: string;
	showSpeciesColumn: boolean;
	showBusiestSession: boolean;
}): Partial<Record<keyof PeriodTotalsRow, ColumnConfig>> {
	return {
		timePeriod: {
			label: firstColumnHeader,
			preferSortAscending: firstColumnHeader !== 'Year'
		},
		...(timeInterval !== 'day' ? { sessionsCount: { label: 'Sessions' } } : {}),
		...(showSpeciesColumn ? { speciesCount: { label: 'Species' } } : {}),
		...(timeInterval !== 'day'
			? {
					encounterCount: {
						label: 'Encounters'
					}
				}
			: {}),
		...(showBusiestSession
			? { maxPerSession: { label: 'Busiest session' } }
			: {}),
		// On an encounters-only tab a per-period bird count is meaningless, so
		// the whole column renders a `'-'` placeholder rather than a number.
		individualsCount: {
			label: 'Birds',
			...(dashIndividuals ? { formatter: () => '-' } : {})
		},
		...buildStandardColumnConfigs<PeriodTotalsRow>(hasPulli, true, aggregateBy)
	};
}

export function PeriodTotalsTable({
	timeInterval,
	rows,
	firstColumnHeader,
	buildHref,
	buildLabel,
	totalsStats,
	aggregationFixedTo,
	dashIndividuals = false,
	extraControls,
	showSpeciesColumn = true,
	showBusiestSession = true
}: {
	timeInterval: PeriodTotalsGrouping;
	rows: CoreStatsResult[];
	firstColumnHeader: string;
	buildHref: (timePeriod: string) => string;
	// Overrides the default `formatPeriodTotalsLabel(timeInterval, ...)` first-column
	// text — e.g. the month-totals caller supplies a timezone-safe label built
	// from integer year/month rather than parsing the `time_period` string.
	buildLabel?: (timePeriod: string) => string;
	totalsStats?: CoreStatsResult;
	// When set, aggregation is locked to this value and the Bird/Encounter toggle
	// still renders but is disabled — the all-time "Month totals" tab fixes it to
	// `'encounter'`, since combine-years bird counts aren't meaningful.
	aggregationFixedTo?: AggregateByValue;
	// Renders every Individuals cell (data rows and the totals row) as `'-'`.
	dashIndividuals?: boolean;
	// Optional extra controls rendered above the table, e.g. a toggle to switch
	// between combined-months and per-year-months views.
	extraControls?: React.ReactNode;
	showSpeciesColumn?: boolean;
	showBusiestSession?: boolean;
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
			? derivePeriodTotalsRowByBird
			: derivePeriodTotalsRowByEncounter;

	const resolveLabel =
		buildLabel ??
		((timePeriod: string) => formatPeriodTotalsLabel(timeInterval, timePeriod));

	const hasPulli = rows.some((stat) => activeDeriveRow(stat).pullus > 0);
	const columnConfigs = buildColumnConfigs({
		firstColumnHeader,
		hasPulli,
		dashIndividuals,
		aggregateBy,
		showSpeciesColumn,
		showBusiestSession,
		timeInterval
	});

	const totalsRow = totalsStats
		? buildTotalsRowCells<PeriodTotalsRow>({
				columnConfigs,
				totalsRowModel: activeDeriveRow(totalsStats),
				...(dashIndividuals ? { cellOverrides: { individualsCount: '-' } } : {})
			})
		: undefined;

	// Recreated each render since `timeInterval`/`buildHref` are props, not static
	// — the cell itself is stateless, so this only costs identity, not
	// behaviour.
	const PeriodLabelCell = createNameLinkCell<CoreStatsResult, PeriodTotalsRow>(
		(model) => resolveLabel(model.timePeriod),
		(model) => (model.sessionsCount ? buildHref(model.timePeriod) : undefined)
	);

	function PeriodTotalsTableBody({
		data,
		columnConfigs
	}: {
		data: RowModelWithRawData<CoreStatsResult, PeriodTotalsRow>[];
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
		<>
			<div data-test-id="above-header-row" className="m-2 flex gap-4">
				{timeInterval !== 'day' && (
					<AggregateByToggle
						value={aggregateBy}
						onChange={setAggregateBy}
						disabled={aggregationFixedTo !== undefined}
					/>
				)}
				{extraControls ?? null}
			</div>
			<SortableTable<CoreStatsResult, PeriodTotalsRow>
				columnConfigs={columnConfigs}
				data={rows}
				testId="period-totals-table"
				rowDataTransform={activeDeriveRow}
				initialSortColumn="timePeriod"
				totalsRow={totalsRow}
				TableBodyComponent={PeriodTotalsTableBody}
			/>
		</>
	);
}
