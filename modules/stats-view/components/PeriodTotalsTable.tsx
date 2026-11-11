'use client';

import { useState } from 'react';
import type { StatsResult } from '@/modules/stats/browser';
import {
	derivePeriodTotalsRowByBird,
	derivePeriodTotalsRowByEncounter,
	formatPeriodTotalsLabel
} from '../lib/period-totals';
import type { PeriodTotalsGrouping, PeriodTotalsRow } from '../types';
import {
	buildBiometricColumnConfigs,
	buildStandardColumnConfigs,
	buildTotalsRowCells,
	createNameLinkCell
} from '../lib/StatsTableColumnConfigs';
import {
	AggregateByToggle,
	type AggregateByValue
} from '../lib/AggregateByToggle';
import { CountsBiometricsToggle } from '../lib/CountsBiometricsToggle';
import {
	SortableTable,
	getFormattedValue,
	type ColumnConfig,
	type RowModelWithRawData
} from '@/modules/ui-kit';

function buildColumnConfigs({
	timeInterval,
	firstColumnHeader,
	hasPulli,
	aggregateBy,
	showSpeciesColumn,
	showBusiestSession,
	showBiometrics
}: {
	timeInterval: PeriodTotalsGrouping;
	firstColumnHeader: string;
	hasPulli: boolean;
	aggregateBy: string;
	showSpeciesColumn: boolean;
	showBusiestSession: boolean;
	showBiometrics: boolean;
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
		// The breakdown block after "Birds" (#1432) — either the age-bucket
		// counts (today's default) or the 8 wing/weight biometric columns,
		// switched by `CountsBiometricsToggle`. Every column above is
		// unaffected by either mode.
		...(showBiometrics
			? buildBiometricColumnConfigs()
			: buildStandardColumnConfigs<PeriodTotalsRow>(
					hasPulli,
					true,
					aggregateBy
				))
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
	rows: StatsResult[];
	firstColumnHeader: string;
	buildHref: (timePeriod: string) => string;
	// Overrides the default `formatPeriodTotalsLabel(timeInterval, ...)` first-column
	// text — e.g. the month-totals caller supplies a timezone-safe label built
	// from integer year/month rather than parsing the `time_period` string.
	buildLabel?: (timePeriod: string) => string;
	totalsStats?: StatsResult;
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
	// Counts vs biometrics breakdown block (#1432) — same reset-on-remount
	// behaviour as `aggregateBy` above, defaulting to counts (`false`).
	const [showBiometrics, setShowBiometrics] = useState(false);

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
		timeInterval,
		showBiometrics
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
	const PeriodLabelCell = createNameLinkCell<StatsResult, PeriodTotalsRow>(
		(model) => resolveLabel(model.timePeriod),
		(model) => (model.sessionsCount ? buildHref(model.timePeriod) : undefined)
	);

	function PeriodTotalsTableBody({
		data,
		columnConfigs
	}: {
		data: RowModelWithRawData<StatsResult, PeriodTotalsRow>[];
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
				{/* Design decision (#1432): `AggregateByToggle`'s bird/encounter
				    distinction only affects the counts breakdown block, which
				    biometrics mode replaces with the 8 wing/weight columns —
				    identical regardless of aggregation. Hidden while biometrics
				    mode is active for the same reason it's already hidden for
				    "day": left visible, it would have no effect on anything
				    rendered. */}
				{timeInterval !== 'day' && !showBiometrics && (
					<AggregateByToggle value={aggregateBy} onChange={setAggregateBy} />
				)}
				<CountsBiometricsToggle
					value={showBiometrics}
					onChange={setShowBiometrics}
				/>
				{extraControls ?? null}
			</div>
			<SortableTable<StatsResult, PeriodTotalsRow>
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
