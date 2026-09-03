'use client';

import { useState } from 'react';
import { type SessionEncounter } from '@/app/models/session';
import { type NetRound } from '@/app/models/session-chronology';
import { getAgeClass } from '@/app/models/encounter';
export type SpeciesWithEncounters = {
	species: string;
	encounters: SessionEncounter[];
};
import {
	type ColumnConfig,
	SortableTable,
	type RowModelWithRawData
} from '../../shared/SortableTable';
import {
	buildStandardColumnConfigs,
	buildTotalsRowCells,
	createNameLinkCell
} from '../../shared/StatsTableColumnConfigs';
import { createStatsTableBody } from '../../shared/StatsTableBody';
import { TabNav } from '../../TabNav';
import { EncountersTable } from './EncountersTable';
import { SessionHighlights } from './SessionHighlights';

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
	newYoung: number;
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
		newYoung: data.encounters.filter(
			(encounter) =>
				encounter.record_type === 'N' &&
				(encounter.age_code === 1 || encounter.age_code === 3)
		).length,
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
			invertSort: true
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

function ConditionalTabPanel({
	loadedTabs,
	tabId,
	activeTabId,
	children
}: {
	loadedTabs: Set<string>;
	tabId: string;
	activeTabId: string;
	children: React.ReactNode;
}) {
	if (loadedTabs.has(tabId)) {
		return tabId === activeTabId ? (
			<div>{children}</div>
		) : (
			<div className="hidden" aria-hidden="true">
				{children}
			</div>
		);
	}
	return null;
}

export function SessionTabs({
	speciesList,
	netRounds,
	locationId,
	date,
	viewedGroupId,
	oldestEncounter = null
}: {
	speciesList: SpeciesWithEncounters[];
	netRounds: NetRound[];
	locationId?: number;
	date: string;
	viewedGroupId: number;
	oldestEncounter?: SessionEncounter | null;
}) {
	const [loadedTabs, setLoadedTabs] = useState<Set<string>>(
		new Set(['species'])
	);
	const [activeTab, setActiveTab] = useState('species');

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

	const tabNavConfig = [
		{ id: 'species', label: 'Species totals' },
		{ id: 'net-rounds', label: 'Net rounds' }
	];

	if (!locationId) {
		tabNavConfig.push({ id: 'highlights', label: 'Highlights' });
	}
	return (
		<>
			<TabNav
				tabs={tabNavConfig}
				activeTab={activeTab}
				onTabChange={(tab) => {
					setLoadedTabs((prev) => new Set([...prev, tab]));
					setActiveTab(tab);
				}}
			/>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="species"
				activeTabId={activeTab}
			>
				<SortableTable<SpeciesWithEncounters, RowModel>
					columnConfigs={columnConfigs}
					data={speciesList}
					testId="session-table"
					initialSortColumn="total"
					rowDataTransform={rowDataTransform}
					totalsRow={totalsRow}
					TableBodyComponent={SessionTableBody}
				/>
			</ConditionalTabPanel>
			<ConditionalTabPanel
				loadedTabs={loadedTabs}
				tabId="net-rounds"
				activeTabId={activeTab}
			>
				<div>
					{netRounds.map((round, index) => (
						<div key={round.startTime}>
							<h3 className="mt-4 mb-2 font-semibold">
								Net round {index + 1}: {round.startTime.slice(0, 5)}
							</h3>
							<EncountersTable
								encounters={round.encounters}
								size="responsive"
								showTimeColumn={false}
								showSpeciesColumn={true}
								testId="net-round-table"
							/>
						</div>
					))}
				</div>
			</ConditionalTabPanel>
			{locationId ? null : (
				<ConditionalTabPanel
					loadedTabs={loadedTabs}
					tabId="highlights"
					activeTabId={activeTab}
				>
					<SessionHighlights
						date={date}
						viewedGroupId={viewedGroupId}
						oldestEncounter={oldestEncounter}
					/>
				</ConditionalTabPanel>
			)}
		</>
	);
}
