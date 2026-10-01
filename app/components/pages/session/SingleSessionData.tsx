'use client';

import { type SessionEncounter } from '@/app/models/session';
import { type NetRound } from '@/app/lib/session-chronology';
import { getAgeClass } from '@/app/models/encounter';
import { useLinkableTabs } from '@/app/components/shared/useLinkableTabs';
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

// Shared by the Mist-netting and Other catches tabs (#1022) — same species-totals
// table, just over a differently-filtered `speciesList`. Each computes its own
// `hasPulli`/totals independently, since one capture method catching pulli says
// nothing about whether the other did too.
function SpeciesTotalsPanel({
	speciesList,
	tabId,
	activeTab,
	loadedTabs,
	testId
}: {
	speciesList: SpeciesWithEncounters[];
	tabId: string;
	activeTab: string;
	loadedTabs: Set<string>;
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
		<ConditionalTabPanel
			loadedTabs={loadedTabs}
			tabId={tabId}
			activeTabId={activeTab}
		>
			<SortableTable<SpeciesWithEncounters, RowModel>
				columnConfigs={columnConfigs}
				data={speciesList}
				testId={testId}
				initialSortColumn="total"
				rowDataTransform={rowDataTransform}
				totalsRow={totalsRow}
				TableBodyComponent={SessionTableBody}
			/>
		</ConditionalTabPanel>
	);
}

export function SessionTabs({
	mistNetSpeciesList,
	otherCatchesSpeciesList,
	netRounds,
	date,
	viewedGroupId,
	oldestEncounter = null,
	initialTabId
}: {
	mistNetSpeciesList: SpeciesWithEncounters[];
	otherCatchesSpeciesList: SpeciesWithEncounters[];
	netRounds: NetRound[];
	date: string;
	viewedGroupId: number;
	oldestEncounter?: SessionEncounter | null;
	initialTabId?: string;
}) {
	const hasMistNetEncounters = mistNetSpeciesList.length > 0;
	const hasOtherCatches = otherCatchesSpeciesList.length > 0;

	const tabNavConfig: { id: string; label: string }[] = [];
	if (hasMistNetEncounters) {
		tabNavConfig.push({ id: 'mist-netting', label: 'Mist-netting' });
	}
	if (hasOtherCatches) {
		tabNavConfig.push({ id: 'other-catches', label: 'Other catches' });
	}
	tabNavConfig.push({ id: 'net-rounds', label: 'Net rounds' });
	tabNavConfig.push({ id: 'highlights', label: 'Highlights' });

	// The `?tabId=` param (#803, applied here by #805) wins over this render's
	// first tab when it names one of this render's actual tabs; an
	// unknown/garbage value or no param at all falls back to that first tab.
	// Which tab is first varies by day (#1022): Mist-netting and Other catches
	// are only in `tabNavConfig` at all when the day has a matching encounter,
	// so the default is whichever of those two (if either) actually has data,
	// falling through to the always-present Net rounds tab otherwise. Shared
	// with the species and summary pages via `useLinkableTabs` (#818).
	const { activeTab, loadedTabs, selectTab } = useLinkableTabs({
		tabIds: tabNavConfig.map((tab) => tab.id),
		defaultTabId: tabNavConfig[0].id,
		initialTabId
	});

	return (
		<>
			<TabNav
				tabs={tabNavConfig}
				activeTab={activeTab}
				onTabChange={selectTab}
			/>
			{hasMistNetEncounters && (
				<SpeciesTotalsPanel
					speciesList={mistNetSpeciesList}
					tabId="mist-netting"
					activeTab={activeTab}
					loadedTabs={loadedTabs}
					testId="session-table"
				/>
			)}
			{hasOtherCatches && (
				<SpeciesTotalsPanel
					speciesList={otherCatchesSpeciesList}
					tabId="other-catches"
					activeTab={activeTab}
					loadedTabs={loadedTabs}
					testId="other-catches-table"
				/>
			)}
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
		</>
	);
}
