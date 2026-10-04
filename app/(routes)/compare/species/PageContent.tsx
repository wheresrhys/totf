'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import {
	PageWrapper,
	PrimaryHeading,
	Standfirst
} from '@/app/components/shared/DesignSystem';
import { TabSet } from '@/app/components/shared/TabSet';
import { compareSpeciesBiometricsTab } from '@/app/components/pages/compare-species/CompareSpeciesBiometricsTab';
import { compareSpeciesCoreTab } from '@/app/components/pages/compare-species/CompareSpeciesCoreTab';
import type { CompareSpeciesTabParams } from '@/app/components/pages/compare-species/compare-species-tab-params';
import { SpeciesPillSelector } from '@/app/components/pages/compare-species/SpeciesPillSelector';
import {
	buildSpeciesComparisonQuery,
	listAvailableSpecies,
	toggleSpeciesSelection
} from '@/app/lib/compare-species';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { CompareSpeciesPageData, CompareSpeciesParams } from './page';

/**
 * The dataset toggle, as a `TabSet` tabs array. Homogeneous (both tabs take
 * the same `CompareSpeciesTabParams`), so it needs no `as const` to keep its
 * per-tab params types.
 */
const compareSpeciesTabs = [compareSpeciesCoreTab, compareSpeciesBiometricsTab];

export function CompareSpeciesPageContent({
	params,
	data,
	viewedGroup
}: {
	params: CompareSpeciesParams;
	data: CompareSpeciesPageData;
	viewedGroup: ViewedGroup;
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

	// `window.history.replaceState` rather than `router.replace`: the selection
	// is a pure filter over data this page has already fetched, so a Next.js
	// navigation would re-run the server component (and its RPCs) to produce
	// identical data. `replaceState` rather than `pushState` keeps a session of
	// pill-tapping out of the back button's history.
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

	// Rebuilt every render so a pill tap re-renders whichever dataset tab is
	// showing with the new selection — neither tab fetches, both read their
	// rows straight off here (see `CompareSpeciesTabParams`).
	const tabParams: CompareSpeciesTabParams = {
		coreStats: data.coreStats,
		biometricsStats: data.biometricsStats,
		selectedSpecies
	};

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
			<TabSet
				tabs={compareSpeciesTabs}
				params={tabParams}
				viewedGroup={viewedGroup}
				initialTabId={params.activeTabId}
				initialTabData={data.initialTabData}
				ariaLabel="Dataset"
			/>
		</PageWrapper>
	);
}
