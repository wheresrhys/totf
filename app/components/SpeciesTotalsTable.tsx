'use client';

import { useState } from 'react';
import {
	deriveSpeciesTotalsRow,
	deriveSpeciesTotalsRowByEncounter,
	type SpeciesTotalsRow
} from '@/app/models/species-totals';
import type { AggregateStatsResult } from '@/app/models/db';
import {
	type ColumnConfig,
	SortableTable,
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

type RowModel = {
	speciesName: string;
	sessionsCount: number;
	encounterCount: number;
	individualsCount: number;
	new: number;
	retraps: number;
	pullus: number;
	juvs: number;
	postjuv: number;
	adults: number;
	unknownAge: number;
	newYoung: number;
};

// The period a summary page's species table is scoped to — mirrors the
// `/species/{name}[/{year}[/{month}]]` route depth. Undefined (the all-time
// `/summary` page) keeps today's unscoped `/species/{name}` links.
export type SpeciesPeriod = { year: number; month?: number };

function buildSpeciesHref(speciesName: string, period?: SpeciesPeriod): string {
	if (!period) {
		return `/species/${speciesName}`;
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
		individualsCount: row.individualsCount,
		new: row.newCount,
		retraps: row.retrapsCount,
		pullus: row.pullusCount,
		juvs: row.juvsCount,
		postjuv: row.postjuvCount,
		adults: row.adultsCount,
		unknownAge: row.unknownAgeCount,
		newYoung: row.newYoungCount
	};
}

// Picks the bird-based or encounter-based derive function per #604's
// "Aggregate by" toggle, then reshapes it into `RowModel` via `toRowModel` —
// same function either way, since both derive functions return the same
// `SpeciesTotalsRow` shape.
function deriveRow(
	aggregateBy: AggregateByValue
): (stat: AggregateStatsResult) => SpeciesTotalsRow {
	return aggregateBy === 'bird'
		? deriveSpeciesTotalsRow
		: deriveSpeciesTotalsRowByEncounter;
}

function buildColumnConfigs(
	hasPulli: boolean
): Partial<Record<keyof RowModel, ColumnConfig>> {
	return {
		speciesName: {
			label: 'Species',
			invertSort: true
		},
		sessionsCount: {
			label: 'Sessions'
		},
		encounterCount: {
			label: 'Encounters'
		},
		individualsCount: {
			label: 'Individuals'
		},
		...buildStandardColumnConfigs<RowModel>(hasPulli)
	};
}

export function SpeciesTotalsTable({
	speciesStats,
	totalsStats,
	period
}: {
	speciesStats: AggregateStatsResult[];
	totalsStats?: AggregateStatsResult;
	// The summary page this table is rendered on, if any is period-scoped —
	// see `buildSpeciesHref` above. Undefined on the all-time page.
	period?: SpeciesPeriod;
}) {
	// Local to this table (not persisted across tab switches) — resets to
	// 'bird' whenever `SpeciesTotalsSection` remounts this table for a
	// different tab, per #604.
	const [aggregateBy, setAggregateBy] = useState<AggregateByValue>('bird');

	if (speciesStats.length === 0) {
		return <p>No species recorded.</p>;
	}

	// Recreated each render since `period` is a prop, not static — the cell
	// itself is stateless, so this only costs identity, not behaviour (same
	// approach as `PeriodTotalsTable`'s `PeriodLabelCell`).
	const SpeciesNameCell = createNameLinkCell<AggregateStatsResult, RowModel>(
		(model) => model.speciesName,
		(model) => buildSpeciesHref(model.speciesName, period)
	);

	function SpeciesTotalsTableBody({
		data,
		columnConfigs
	}: {
		data: RowModelWithRawData<AggregateStatsResult, RowModel>[];
		columnConfigs?: Partial<Record<keyof RowModel, ColumnConfig>>;
	}) {
		const orderedColumnProperties = Object.keys(columnConfigs ?? {}).filter(
			(property) => property !== 'speciesName'
		) as (keyof RowModel)[];

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
								{row[property]}
							</td>
						))}
					</tr>
				))}
			</tbody>
		);
	}

	const activeDeriveRow = deriveRow(aggregateBy);
	const rowDataTransform = (stat: AggregateStatsResult) =>
		toRowModel(activeDeriveRow(stat));
	const hasPulli = speciesStats.some(
		(stat) => activeDeriveRow(stat).pullusCount > 0
	);
	const columnConfigs = buildColumnConfigs(hasPulli);

	const totalsRow = totalsStats
		? buildTotalsRowCells<RowModel>({
				columnConfigs,
				totalsRowModel: toRowModel(activeDeriveRow(totalsStats))
			})
		: undefined;

	return (
		<SortableTable<AggregateStatsResult, RowModel>
			columnConfigs={columnConfigs}
			data={speciesStats}
			testId="species-totals-table"
			rowDataTransform={rowDataTransform}
			totalsRow={totalsRow}
			aboveHeaderRow={{
				spanFromColumn: 'new',
				spanToColumn: 'unknownAge',
				content: (
					<AggregateByToggle value={aggregateBy} onChange={setAggregateBy} />
				)
			}}
			TableBodyComponent={SpeciesTotalsTableBody}
		/>
	);
}
