import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { MultiSpeciesStatsTable } from '@/app/components/MultiSpeciesStatsTable';
import { fetchSpeciesData } from '@/app/actions/multi-species-data';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import type { SpeciesStatsRow } from '@/app/models/db';

//TODO get year/date range from URL params

export type PageData = {
	speciesStats: SpeciesStatsRow[];
	years: number[];
};

async function fetchYears(): Promise<number[]> {
	const dates = (await supabase
		.from('Sessions')
		.select('visit_date')
		.order('visit_date', { ascending: false })
		.then(catchSupabaseErrors)) as { visit_date: string }[];

	return [
		...new Set(dates.map((date) => new Date(date.visit_date).getFullYear()))
	] as number[];
}

async function fetchInitialPageData(): Promise<PageData> {
	const [speciesStats, years] = await Promise.all([
		fetchSpeciesData(),
		fetchYears()
	]);
	return {
		speciesStats,
		years
	};
}

export default async function AllSpeciesPage() {
	return (
		<BootstrapPageData<PageData>
			getCacheKeys={() => ['species']}
			dataFetcher={fetchInitialPageData}
			PageComponent={MultiSpeciesStatsTable}
		/>
	);
}
