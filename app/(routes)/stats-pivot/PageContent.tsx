'use client';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PageWrapper, PrimaryHeading, Standfirst } from '@/modules/ui-kit';
import { MetricSelector } from '@/app/components/pages/stats-pivot/MetricSelector';
import { SpeciesFilterSelect } from '@/app/components/pages/stats-pivot/SpeciesFilterSelect';
import { StatsPivotTable } from '@/app/components/pages/stats-pivot/StatsPivotTable';
import {
	buildStatsPivotQuery,
	seedMetricSelection,
	toggleMetricSelection,
	type MetricSelection,
	type PivotMetricColumn,
	type StatsPivotParams
} from '@/app/lib/stats-pivot';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { StatsPivotPageData } from './page';

export function StatsPivotPageContent({
	params,
	data
}: {
	params: StatsPivotParams;
	data: StatsPivotPageData;
	viewedGroup: ViewedGroup;
}) {
	const pathname = usePathname();
	const router = useRouter();
	const [selection, setSelection] = useState<MetricSelection>(() =>
		seedMetricSelection(params.selectedStats)
	);

	function buildUrl(species: string | null, nextSelection: MetricSelection) {
		const query = buildStatsPivotQuery(species, nextSelection);
		return query ? `${pathname}?${query}` : pathname;
	}

	// Metric selection only filters rows already fetched, so it just mirrors
	// onto the URL; a species change needs different rows, so it navigates.
	function handleMetricToggle(column: PivotMetricColumn) {
		const nextSelection = toggleMetricSelection(selection, column);
		setSelection(nextSelection);
		window.history.replaceState(
			null,
			'',
			buildUrl(data.species, nextSelection)
		);
	}

	function handleSpeciesChange(species: string | null) {
		router.replace(buildUrl(species, selection));
	}

	return (
		<PageWrapper>
			<PrimaryHeading>Stats pivot</PrimaryHeading>
			<Standfirst testId="stats-pivot-standfirst">
				Tap a metric to add it to the table, and tap it again to remove it.
			</Standfirst>
			<SpeciesFilterSelect
				availableSpecies={data.availableSpecies}
				selectedSpecies={data.species}
				onChange={handleSpeciesChange}
			/>
			<MetricSelector selection={selection} onToggle={handleMetricToggle} />
			<StatsPivotTable sourceRows={data.sourceRows} selection={selection} />
		</PageWrapper>
	);
}
