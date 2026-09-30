'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import type { SpeciesComparisonStats } from '@/app/actions/compare-species';
import {
	PageWrapper,
	PrimaryHeading,
	Standfirst
} from '@/app/components/shared/DesignSystem';
import { TabNav } from '@/app/components/TabNav';
import {
	biometricsComparisonColumns,
	coreStatsComparisonColumns,
	demographicsComparisonColumns
} from '@/app/components/pages/compare-species/comparison-columns';
import { SpeciesComparisonTable } from '@/app/components/pages/compare-species/SpeciesComparisonTable';
import { SpeciesPillSelector } from '@/app/components/pages/compare-species/SpeciesPillSelector';
import {
	buildSpeciesComparisonQuery,
	comparisonDatasetTabs,
	listAvailableSpecies,
	selectComparisonRows,
	toggleSpeciesSelection,
	type ComparisonDatasetId
} from '@/app/lib/compare-species';
import type { CompareSpeciesParams } from './page';

const COMPARISON_TABLE_TEST_ID = 'species-comparison-table';

export function CompareSpeciesPageContent({
	params,
	data
}: {
	params: CompareSpeciesParams;
	data: SpeciesComparisonStats;
}) {
	const pathname = usePathname();
	const availableSpecies = listAvailableSpecies(data.coreStats);
	// A `?name=` the group has no data for (stale bookmark, hand-edited URL)
	// would otherwise contribute a row of blank cells to every dataset, so it's
	// dropped rather than shown as an empty comparison.
	const [selectedSpecies, setSelectedSpecies] = useState<string[]>(() =>
		params.selectedSpecies.filter((speciesName) =>
			availableSpecies.includes(speciesName)
		)
	);
	const [datasetId, setDatasetId] = useState<ComparisonDatasetId>(
		comparisonDatasetTabs[0].id
	);

	// `window.history.replaceState` rather than `router.replace`: the selection
	// is a pure filter over data this page has already fetched, so a Next.js
	// navigation would re-run the server component (and its three RPCs) to
	// produce identical data. `replaceState` rather than `pushState` keeps a
	// session of pill-tapping out of the back button's history.
	function handleSpeciesToggle(speciesName: string) {
		const nextSelection = toggleSpeciesSelection(selectedSpecies, speciesName);
		setSelectedSpecies(nextSelection);
		const query = buildSpeciesComparisonQuery(nextSelection);
		window.history.replaceState(
			null,
			'',
			query ? `${pathname}?${query}` : pathname
		);
	}

	return (
		<PageWrapper>
			<PrimaryHeading>Compare species</PrimaryHeading>
			<Standfirst testId="compare-species-standfirst">
				Tap a species to add it to the table, and tap it again to remove it.
			</Standfirst>
			<SpeciesPillSelector
				availableSpecies={availableSpecies}
				selectedSpecies={selectedSpecies}
				onToggle={handleSpeciesToggle}
			/>
			<TabNav
				tabs={comparisonDatasetTabs}
				activeTab={datasetId}
				onTabChange={(tabId) => setDatasetId(tabId as ComparisonDatasetId)}
				ariaLabel="Dataset"
			/>
			{datasetId === 'core' ? (
				<SpeciesComparisonTable
					rows={selectComparisonRows(data.coreStats, selectedSpecies)}
					columnConfigs={coreStatsComparisonColumns}
					testId={COMPARISON_TABLE_TEST_ID}
				/>
			) : null}
			{datasetId === 'biometrics' ? (
				<SpeciesComparisonTable
					rows={selectComparisonRows(data.biometricsStats, selectedSpecies)}
					columnConfigs={biometricsComparisonColumns}
					testId={COMPARISON_TABLE_TEST_ID}
				/>
			) : null}
			{datasetId === 'demographics' ? (
				<SpeciesComparisonTable
					rows={selectComparisonRows(data.demographicsStats, selectedSpecies)}
					columnConfigs={demographicsComparisonColumns}
					testId={COMPARISON_TABLE_TEST_ID}
				/>
			) : null}
		</PageWrapper>
	);
}
