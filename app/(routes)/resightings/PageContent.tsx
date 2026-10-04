'use client';
import type { ResightingEncounter } from '@/app/models/session';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { TabSet, type TabSetTabConfig } from '@/app/components/shared/TabSet';
import { ResightingsSpeciesTab } from '@/app/components/pages/resightings/ResightingsSpeciesTab';
import { groupResightingsBySpecies } from '@/app/lib/resightings';
import type { ViewedGroup } from '@/app/lib/group-slug';

/**
 * One `TabConfig` per species bucket (`All` first, then one per species
 * present in the data), in `groupResightingsBySpecies`' own key order — the
 * same order `page.tsx` derives its tab id list from, so a `?tabId=` deep link
 * resolved server-side always names a tab this array actually contains.
 *
 * No tab has a `dataFetcher`: the resightings the tabs render are already
 * fetched page-wide, and each tab filters the shared, unfiltered
 * `ResightingEncounter[]` it is handed as `params`.
 */
function buildResightingsSpeciesTabs(
	resightings: ResightingEncounter[]
): TabSetTabConfig<ResightingEncounter[], ResightingEncounter[]>[] {
	return Object.keys(groupResightingsBySpecies(resightings)).map(
		(speciesId) => ({
			id: speciesId,
			label: speciesId,
			TabComponent: ({ params }: { params: ResightingEncounter[] }) => (
				<ResightingsSpeciesTab speciesId={speciesId} resightings={params} />
			)
		})
	);
}

export function ResightingsPageContent({
	data,
	viewedGroup,
	initialTabId,
	initialTabData
}: {
	data: ResightingEncounter[];
	viewedGroup: ViewedGroup;
	initialTabId?: string;
	initialTabData?: { tabId: string; data: unknown };
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>Resightings</PrimaryHeading>
			<TabSet
				tabs={buildResightingsSpeciesTabs(data)}
				params={data}
				viewedGroup={viewedGroup}
				initialTabId={initialTabId}
				initialTabData={initialTabData}
				ariaLabel="Resightings by species"
			/>
		</PageWrapper>
	);
}
