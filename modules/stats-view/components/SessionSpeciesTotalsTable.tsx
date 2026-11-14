'use client';

import { useState } from 'react';
import { getAgeClass } from '@/app/models/encounter';
import type { SpeciesWithEncounters } from '@/app/models/session';
import {
	buildBiometricColumnConfigs,
	buildStandardColumnConfigs,
	buildTotalsRowCells,
	createNameLinkCell
} from '../lib/StatsTableColumnConfigs';
import { createStatsTableBody } from '../lib/StatsTableBody';
import { CountsBiometricsToggle } from '../lib/CountsBiometricsToggle';
import { deriveSessionSpeciesBiometrics } from '../lib/session-species-biometrics';
import type { SessionSpeciesBiometrics, StatsClass } from '../types';
import {
	SortableTable,
	type ColumnConfig,
	type RowModelWithRawData
} from '@/modules/ui-kit';
import { EncountersTable } from '@/app/components/pages/session/EncountersTable';

const SpeciesNameCell = createNameLinkCell<SpeciesWithEncounters, RowModel>(
	(model) => model.species,
	(model) => `/species/${model.species}`
);

// Drill-down content for an expanded species row: the species' encounters, as a
// compact table without the redundant Species column.
function ExpandedSpeciesEncounters({
	model: {
		_rawRowData: { encounters }
	}
}: {
	model: RowModelWithRawData<SpeciesWithEncounters, RowModel>;
}) {
	return (
		<EncountersTable
			encounters={encounters}
			size="xs"
			showTimeColumn={true}
			showSpeciesColumn={false}
			testId="species-details-table"
		/>
	);
}

type RowModel = {
	species: string;
	total: number;
	new: number;
	retraps: number;
	adults: number;
	pullus: number;
	juvs: number;
	postjuv: number;
	unknownAge: number;
	maxProvenAge: number;
} & SessionSpeciesBiometrics;

// Both the age-bucket counts and the wing/weight biometrics are derived for
// every row, whichever block of columns is currently rendered — the toggle
// below switches the *columns*, not the aggregation.
function rowDataTransform(data: SpeciesWithEncounters): RowModel {
	return {
		species: data.species,
		total: data.encounters.length,
		new: data.encounters.filter((encounter) => encounter.record_type === 'N')
			.length,
		retraps: data.encounters.filter(
			(encounter) => encounter.record_type === 'S'
		).length,
		adults: data.encounters.filter(
			(encounter) => getAgeClass(encounter) === 'adult'
		).length,
		pullus: data.encounters.filter(
			(encounter) => getAgeClass(encounter) === 'pullus'
		).length,
		juvs: data.encounters.filter(
			(encounter) => getAgeClass(encounter) === 'juv'
		).length,
		postjuv: data.encounters.filter(
			(encounter) => getAgeClass(encounter) === 'postjuv'
		).length,
		unknownAge: data.encounters.filter((encounter) => encounter.age_code === 2)
			.length,
		maxProvenAge: Math.max(
			...data.encounters.map((encounter) => encounter.bird.proven_age)
		),
		...deriveSessionSpeciesBiometrics(data.encounters)
	};
}

// `species` and `total` head the table in either mode; what follows them is
// the whole of what the Counts/Biometrics toggle switches. `maxProvenAge` is a
// counts-mode column only — it is neither a count nor a biometric, but it
// belongs with the per-age-class breakdown rather than alongside wing/weight.
function buildColumnConfigs(
	hasPulli: boolean,
	statsClass: StatsClass
): Partial<Record<keyof RowModel, ColumnConfig>> {
	const leadingColumns = {
		species: {
			label: 'Species',
			preferSortAscending: true
		},
		total: {
			label: 'Total',
			cellClassName: 'font-bold'
		}
	};
	return statsClass === 'biometrics'
		? {
				...leadingColumns,
				...buildBiometricColumnConfigs()
			}
		: {
				...leadingColumns,
				...buildStandardColumnConfigs<RowModel>(hasPulli),
				maxProvenAge: {
					label: 'Max Proven Age'
				}
			};
}

// The totals row sums each column across the rows by default, which is right
// for counts and wrong for every biometric stat — a session-wide median is not
// the sum (nor the mean) of its species' medians. So both modes override the
// columns that need re-deriving from the underlying encounters rather than
// reducing over the row models.
function buildTotalsCellOverrides(
	speciesList: SpeciesWithEncounters[],
	rowModels: RowModel[],
	statsClass: StatsClass
): Partial<Record<keyof RowModel, React.ReactNode>> {
	return statsClass === 'biometrics'
		? deriveSessionSpeciesBiometrics(
				speciesList.flatMap(
					(speciesWithEncounters) => speciesWithEncounters.encounters
				)
			)
		: {
				maxProvenAge: Math.max(...rowModels.map((model) => model.maxProvenAge))
			};
}

const SessionTableBody = createStatsTableBody<SpeciesWithEncounters, RowModel>({
	FirstColumnComponent: SpeciesNameCell,
	firstColumnKey: 'species',
	getKey: (model) => model.species,
	ExpandedContentComponent: ExpandedSpeciesEncounters
});

/**
 * The species-totals table shared by the Mist-netting and Other catches tabs
 * (#1022) — same table, just over a differently-filtered `speciesList`. Each
 * tab renders its own instance, so each computes its own `hasPulli`/totals
 * independently: one capture method catching pulli says nothing about whether
 * the other did too.
 */
export function SessionSpeciesTotalsTable({
	speciesList,
	testId
}: {
	speciesList: SpeciesWithEncounters[];
	testId: string;
}) {
	// Local to this table, like `SpeciesTotalsTable`'s own "Aggregate by" state
	// (#604) — each tab's instance toggles independently and resets on remount.
	const [statsClass, setStatsClass] = useState<StatsClass>('counts');
	const hasPulli = speciesList.some((speciesWithEncounters) =>
		speciesWithEncounters.encounters.some(
			(encounter) => getAgeClass(encounter) === 'pullus'
		)
	);
	const columnConfigs = buildColumnConfigs(hasPulli, statsClass);
	const rowModels = speciesList.map(rowDataTransform);
	const totalsRow = buildTotalsRowCells<RowModel>({
		columnConfigs,
		rowModels,
		cellOverrides: buildTotalsCellOverrides(speciesList, rowModels, statsClass)
	});

	return (
		<>
			<div data-test-id="above-header-row" className="m-2 flex gap-4">
				<CountsBiometricsToggle value={statsClass} onChange={setStatsClass} />
			</div>
			<SortableTable<SpeciesWithEncounters, RowModel>
				columnConfigs={columnConfigs}
				data={speciesList}
				testId={testId}
				initialSortColumn="total"
				rowDataTransform={rowDataTransform}
				totalsRow={totalsRow}
				TableBodyComponent={SessionTableBody}
			/>
		</>
	);
}
