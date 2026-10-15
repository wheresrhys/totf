import {
	BootstrapPage,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import { SppStatsTable } from '@/app/components/pages/species/SppStatsTable';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import { fetchYears } from '@/app/lib/fetch-years';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';

//TODO get year/date range from URL params

export type PageData = {
	speciesStats: SpeciesStatsRow[];
	years: number[];
};

export async function fetchSpeciesListPageContent(
	_: DefaultPageParams,
	viewedGroup: ViewedGroup
): Promise<PageData> {
	const [speciesStats, years] = await Promise.all([
		fetchSpeciesData(viewedGroup),
		fetchYears(viewedGroup)
	]);
	return {
		speciesStats,
		years
	};
}

export default async function AllSpeciesPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<PageData>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['species']}
			dataFetcher={fetchSpeciesListPageContent}
			PageComponent={SppStatsTable}
		/>
	);
}
