'use client';

import { useState } from 'react';
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
	aggregateBy,
	showSpeciesColumn,
	showBusiestSession
}: {
	timeInterval: PeriodTotalsGrouping;
	firstColumnHeader: string;
	hasPulli: boolean;
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
		individualsCount: { label: 'Birds' },
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
	// Optional extra controls rendered above the table, e.g. a toggle to switch
	// between combined-months and per-year-months views.
	extraControls?: React.ReactNode;
	showSpeciesColumn?: boolean;
	showBusiestSession?: boolean;
}) {
	// Local to this table (not persisted across tab switches) — resets to
	// 'bird' whenever `SummaryTotalsSection` remounts this table for a
	// different tab, per #604.
	const [aggregateBy, setAggregateBy] = useState<AggregateByValue>('bird');

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
		aggregateBy,
		showSpeciesColumn,
		showBusiestSession,
		timeInterval
	});

	const totalsRow = totalsStats
		? buildTotalsRowCells<PeriodTotalsRow>({
				columnConfigs,
				totalsRowModel: activeDeriveRow(totalsStats)
			})
		: undefined;

	// Recreated each render since `timeInterval`/`buildHref` are props, not static
	// — the cell itself is stateless, so this only costs identity, not
	// behaviour.
	//
	// Gating on `sessionsCount` (`core_stats.session_count`) truthy is still
	// correct after #1021 redefined it to a plain `COUNT(DISTINCT visit_date)`,
	// unconditional on `Sessions.session_type` (audited in #1023): the count is
	// grounded in `stats_raw_encounters`, which already drops resighting-type
	// encounters at the row level (#874), so a date whose only encounters are
	// resightings contributes no `visit_date` and `session_count` stays 0 for
	// it — same end result as the old `session_type = 'FULL_GROWN'` filter, via
	// the row-level filter instead of the session-level one. For `day`-grouped
	// rows specifically, this is doubly guaranteed: `stats_spine`'s day branch
	// is sparse, keyed off that same resighting-filtered `raw_encounters`, so a
	// resighting-only date never even produces a row to gate in the first
	// place.
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
					<AggregateByToggle value={aggregateBy} onChange={setAggregateBy} />
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
