'use client';

import { useState } from 'react';
import {
	deriveSpeciesTotalsRow,
	deriveSpeciesTotalsRowByEncounter
} from '../lib/species-totals';
import {
	BiometricStatNames,
	type BiometricStatName,
	type StatsCacheBySpeciesResult
} from '@/modules/stats/browser';
import type { SpeciesTotalsRow } from '../types';
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
	type ColumnConfig,
	getFormattedValue,
	SortableTable,
	type RowModelWithRawData
} from '@/modules/ui-kit';
import { buildSpeciesSquashedMonthHref } from '../lib/squashed-month';

// The 8 `BiometricStatName` fields are intersected on rather than listed by
// hand, matching `SpeciesTotalsRow` (`../types`) — see its comment for why.
type RowModel = {
	speciesName: string;
	sessionsCount: number;
	encounterCount: number;
	maxPerSession: number;
	individualsCount: number;
	new: number;
	retraps: number;
	pullus: number;
	juvs: number;
	postjuv: number;
	adults: number;
	unknownAge: number;
} & Record<BiometricStatName, number | null>;

// The period a summary page's species table is scoped to — mirrors the
// `/species/{name}[/{year}[/{month}]]` route depth. Undefined (the all-time
// `/summary` page) keeps today's unscoped `/species/{name}` links. The
// `squashedMonth` variant (#1005) is the summary squashed-month page's own
// shape — `/species/{name}/{abbr}` rather than a real year.
export type SpeciesPeriod =
	| { year: number; month?: number }
	| { squashedMonth: number };

function buildSpeciesHref(speciesName: string, period?: SpeciesPeriod): string {
	if (!period) {
		return `/species/${speciesName}`;
	}
	if ('squashedMonth' in period) {
		return buildSpeciesSquashedMonthHref(speciesName, period.squashedMonth);
	}
	if (period.month === undefined) {
		return `/species/${speciesName}/${period.year}`;
	}
	return `/species/${speciesName}/${period.year}/${period.month}`;
}

function toRowModel(row: SpeciesTotalsRow): RowModel {
	return {
		speciesName: row.speciesName,
		sessionsCount: row.sessionsCount,
		encounterCount: row.encounterCount,
		maxPerSession: row.maxPerSession,
		individualsCount: row.individualsCount,
		new: row.newCount,
		retraps: row.retrapsCount,
		pullus: row.pullusCount,
		juvs: row.juvsCount,
		postjuv: row.postjuvCount,
		adults: row.adultsCount,
		unknownAge: row.unknownAgeCount,
		// `SpeciesTotalsRow` and `RowModel` share the same 8 biometric field
		// names (#1430) — reducing over the canonical list rather than listing
		// them by hand keeps this in step with `extractBiometricFields`
		// (`../lib/species-totals.ts`) and `buildBiometricColumnConfigs`.
		...BiometricStatNames.reduce<Record<BiometricStatName, number | null>>(
			(fields, name) => {
				fields[name] = row[name];
				return fields;
			},
			{} as Record<BiometricStatName, number | null>
		)
	};
}

// Picks the bird-based or encounter-based derive function per #604's
// "Aggregate by" toggle, then reshapes it into `RowModel` via `toRowModel` —
// same function either way, since both derive functions return the same
// `SpeciesTotalsRow` shape.
function deriveRow(
	aggregateBy: AggregateByValue
): (stat: StatsCacheBySpeciesResult) => SpeciesTotalsRow {
	return aggregateBy === 'bird'
		? deriveSpeciesTotalsRow
		: deriveSpeciesTotalsRowByEncounter;
}

// `showBiometrics` switches the block after Individuals between the
// existing age-bucket columns and the 8 biometric columns (#1430) — the
// Species/Sessions/Encounters/Busiest session/Individuals columns before it
// are unaffected by either toggle.
function buildColumnConfigs(
	hasPulli: boolean,
	aggregateBy: string,
	showBiometrics: boolean
): Partial<Record<keyof RowModel, ColumnConfig>> {
	return {
		speciesName: {
			label: 'Species',
			preferSortAscending: true
		},
		sessionsCount: {
			label: 'Sessions'
		},
		encounterCount: {
			label: 'Encounters'
		},
		maxPerSession: {
			label: 'Busiest session'
		},
		individualsCount: {
			label: 'Individuals'
		},
		...(showBiometrics
			? buildBiometricColumnConfigs()
			: buildStandardColumnConfigs<RowModel>(hasPulli, true, aggregateBy))
	};
}

export function SpeciesTotalsTable({
	speciesStats,
	totalsStats,
	period
}: {
	speciesStats: StatsCacheBySpeciesResult[];
	totalsStats?: StatsCacheBySpeciesResult;
	// The summary page this table is rendered on, if any is period-scoped —
	// see `buildSpeciesHref` above. Undefined on the all-time page.
	period?: SpeciesPeriod;
}) {
	// Local to this table (not persisted across tab switches) — resets to
	// 'bird' whenever `SpeciesTotalsSection` remounts this table for a
	// different tab, per #604.
	const [aggregateBy, setAggregateBy] = useState<AggregateByValue>('bird');
	// Independent of `aggregateBy` — the Counts/Biometrics toggle (#1430)
	// switches the post-Individuals column block, defaulting to counts (the
	// existing behaviour everywhere today).
	const [showBiometrics, setShowBiometrics] = useState(false);

	if (speciesStats.length === 0) {
		return <p>No species recorded.</p>;
	}

	// Recreated each render since `period` is a prop, not static — the cell
	// itself is stateless, so this only costs identity, not behaviour (same
	// approach as `PeriodTotalsTable`'s `PeriodLabelCell`).
	const SpeciesNameCell = createNameLinkCell<StatsCacheBySpeciesResult, RowModel>(
		(model) => model.speciesName,
		(model) => buildSpeciesHref(model.speciesName, period)
	);

	function SpeciesTotalsTableBody({
		data,
		columnConfigs
	}: {
		data: RowModelWithRawData<StatsCacheBySpeciesResult, RowModel>[];
		columnConfigs?: Partial<Record<keyof RowModel, ColumnConfig>>;
	}) {
		const orderedColumnProperties = Object.keys(columnConfigs ?? {}).filter(
			(property) => property !== 'speciesName'
		) as (keyof RowModel)[];
		const cellFormatter = getFormattedValue<RowModel>(columnConfigs ?? {});

		return (
			<tbody>
				{data.map((row) => (
					<tr key={row.speciesName}>
						<td>
							<SpeciesNameCell model={row} />
						</td>
						{orderedColumnProperties.map((property) => (
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

	const activeDeriveRow = deriveRow(aggregateBy);
	const rowDataTransform = (stat: StatsCacheBySpeciesResult) =>
		toRowModel(activeDeriveRow(stat));
	const hasPulli = speciesStats.some(
		(stat) => activeDeriveRow(stat).pullusCount > 0
	);
	const columnConfigs = buildColumnConfigs(
		hasPulli,
		aggregateBy,
		showBiometrics
	);

	const totalsRow = totalsStats
		? buildTotalsRowCells<RowModel>({
				columnConfigs,
				totalsRowModel: toRowModel(activeDeriveRow(totalsStats))
			})
		: undefined;

	return (
		<>
			<div data-test-id="above-header-row" className="m-2 flex gap-4">
				{/* Biometrics mode has no age-bucket columns for "Aggregate by" to
				affect, so the toggle is disabled (not hidden) while it's active —
				it stays visible with its last-selected value, same pattern
				`AggregateByToggle`'s own `disabled` prop already supports for a
				fixed-aggregation tab. */}
				<AggregateByToggle
					value={aggregateBy}
					onChange={setAggregateBy}
					disabled={showBiometrics}
				/>
				<CountsBiometricsToggle
					value={showBiometrics}
					onChange={setShowBiometrics}
				/>
			</div>
			<SortableTable<StatsCacheBySpeciesResult, RowModel>
				columnConfigs={columnConfigs}
				data={speciesStats}
				testId="species-totals-table"
				rowDataTransform={rowDataTransform}
				totalsRow={totalsRow}
				TableBodyComponent={SpeciesTotalsTableBody}
			/>
		</>
	);
}
