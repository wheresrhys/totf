import { getAgeClass } from '@/app/models/encounter';
import type { SpeciesWithEncounters } from '@/app/models/session';
import {
	type ColumnConfig,
	SortableTable,
	type RowModelWithRawData
} from '@/app/components/shared/SortableTable';
import {
	buildStandardColumnConfigs,
	buildTotalsRowCells,
	createNameLinkCell
} from '@/app/components/shared/StatsTableColumnConfigs';
import { createStatsTableBody } from '@/app/components/shared/StatsTableBody';
import { EncountersTable } from './EncountersTable';

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
};

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
		)
	};
}

function buildColumnConfigs(
	hasPulli: boolean
): Partial<Record<keyof RowModel, ColumnConfig>> {
	return {
		species: {
			label: 'Species',
			preferSortAscending: true
		},
		total: {
			label: 'Total',
			cellClassName: 'font-bold'
		},
		...buildStandardColumnConfigs<RowModel>(hasPulli),
		maxProvenAge: {
			label: 'Max Proven Age'
		}
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
	const hasPulli = speciesList.some((speciesWithEncounters) =>
		speciesWithEncounters.encounters.some(
			(encounter) => getAgeClass(encounter) === 'pullus'
		)
	);
	const columnConfigs = buildColumnConfigs(hasPulli);
	const rowModels = speciesList.map(rowDataTransform);
	const totalsRow = buildTotalsRowCells<RowModel>({
		columnConfigs,
		rowModels,
		cellOverrides: {
			maxProvenAge: Math.max(...rowModels.map((model) => model.maxProvenAge))
		}
	});

	return (
		<SortableTable<SpeciesWithEncounters, RowModel>
			columnConfigs={columnConfigs}
			data={speciesList}
			testId={testId}
			initialSortColumn="total"
			rowDataTransform={rowDataTransform}
			totalsRow={totalsRow}
			TableBodyComponent={SessionTableBody}
		/>
	);
}
