'use client';

import { useState } from 'react';
import {
	AggregateByToggle,
	type AggregateByValue,
	buildBiometricColumnConfigs,
	buildStandardColumnConfigs,
	createNameLinkCell,
	createStatsTableBody,
	CountsBiometricsToggle,
	deriveSpeciesTotalsRow,
	deriveSpeciesTotalsRowByEncounter,
	type SpeciesTotalsRow,
	type StatsClass
} from '@/modules/stats-view';
import { SortableTable, type ColumnConfig } from '@/modules/ui-kit';
import type { ComparisonRow } from '@/app/lib/compare-species';
import {
	BiometricStatNames,
	type BiometricStatName,
	type StatsCacheBySpeciesResult
} from '@/modules/stats/browser';

/** The comparison table's one test id — only one table is ever rendered now. */
export const COMPARISON_TABLE_TEST_ID = 'species-comparison-table';

/**
 * Mirrors `SpeciesTotalsTable`'s own `RowModel`/`toRowModel`/`deriveRow` trio
 * (`modules/stats-view/components/SpeciesTotalsTable.tsx`) rather than
 * extracting a shared helper — this is only the 2nd use case, below this
 * repo's DRY-after-3rd-use threshold (root `CLAUDE.md`). The 8
 * `BiometricStatName` fields are intersected on rather than listed by hand,
 * same reasoning as that file.
 */
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
		...BiometricStatNames.reduce<Record<BiometricStatName, number | null>>(
			(fields, name) => {
				fields[name] = row[name];
				return fields;
			},
			{} as Record<BiometricStatName, number | null>
		)
	};
}

// Picks the bird-based or encounter-based derive function per the "Aggregate
// by" toggle, matching `SpeciesTotalsTable`'s own `deriveRow`.
function deriveRow(
	aggregateBy: AggregateByValue
): (stat: StatsCacheBySpeciesResult) => SpeciesTotalsRow {
	return aggregateBy === 'bird'
		? deriveSpeciesTotalsRow
		: deriveSpeciesTotalsRowByEncounter;
}

// Species/Sessions/Encounters head the table in either mode; everything after
// them is what the Counts/Biometrics toggle switches — same column set and
// ordering as `SpeciesTotalsTable`'s own `buildColumnConfigs`.
function buildColumnConfigs(
	hasPulli: boolean,
	aggregateBy: string,
	statsClass: StatsClass
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
		...(statsClass === 'biometrics'
			? buildBiometricColumnConfigs()
			: {
					maxPerSession: {
						label: 'Busiest session'
					},
					individualsCount: {
						label: 'Birds'
					},
					...buildStandardColumnConfigs<RowModel>(hasPulli, true, aggregateBy)
				})
	};
}

const SpeciesNameCell = createNameLinkCell<StatsCacheBySpeciesResult, RowModel>(
	(model) => model.speciesName,
	(model) => `/species/${model.speciesName}`
);

const SpeciesComparisonTableBody = createStatsTableBody<
	StatsCacheBySpeciesResult,
	RowModel
>({
	FirstColumnComponent: SpeciesNameCell,
	firstColumnKey: 'speciesName',
	getKey: (model) => model.speciesName
});

/**
 * The species-comparison page's table (#115), rebuilt on the same
 * Counts/Biometrics + Aggregate-by toggles `SpeciesTotalsTable` uses, rather
 * than its own pair of dataset tabs and bespoke column set — that mechanism
 * predated the toggles (#1430-#1440), which now provide the same switch
 * everywhere else.
 *
 * `rows` is a selection-ordered projection over the page's one by-species
 * dataset — see `selectComparisonRows` (`@/app/lib/compare-species`) — so
 * every element already carries a full `StatsCacheBySpeciesResult` in
 * practice: the pill list this page offers is derived from that same
 * dataset, so a selected species always has a row. `ComparisonRow`'s
 * `species_name`-only placeholder shape is a guard for other, hypothetical
 * callers whose rows and selection come from different places — hence the
 * single documented assertion below rather than widening `deriveRow`'s
 * signature to accept a partial row.
 */
export function SpeciesComparisonTable({
	rows,
	testId = COMPARISON_TABLE_TEST_ID
}: {
	rows: ComparisonRow<StatsCacheBySpeciesResult>[];
	testId?: string;
}) {
	const [aggregateBy, setAggregateBy] = useState<AggregateByValue>('bird');
	const [statsClass, setStatsClass] = useState<StatsClass>('counts');

	const speciesStats = rows as StatsCacheBySpeciesResult[];
	const activeDeriveRow = deriveRow(aggregateBy);
	const rowDataTransform = (stat: StatsCacheBySpeciesResult) =>
		toRowModel(activeDeriveRow(stat));
	const hasPulli = speciesStats.some(
		(stat) => activeDeriveRow(stat).pullusCount > 0
	);
	const columnConfigs = buildColumnConfigs(hasPulli, aggregateBy, statsClass);

	return (
		<>
			<div data-test-id="above-header-row" className="m-2 flex gap-4">
				{/* Biometrics mode has no age-bucket columns for "Aggregate by" to
				affect, so the toggle is disabled (not hidden) while it's active,
				matching `SpeciesTotalsTable`'s own treatment. */}
				<AggregateByToggle
					value={aggregateBy}
					onChange={setAggregateBy}
					disabled={statsClass === 'biometrics'}
				/>
				<CountsBiometricsToggle value={statsClass} onChange={setStatsClass} />
			</div>
			<SortableTable<StatsCacheBySpeciesResult, RowModel>
				columnConfigs={columnConfigs}
				data={speciesStats}
				testId={testId}
				rowDataTransform={rowDataTransform}
				initialSortColumn="speciesName"
				TableBodyComponent={SpeciesComparisonTableBody}
			/>
		</>
	);
}
