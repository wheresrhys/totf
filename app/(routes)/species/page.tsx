import {
	BootstrapPageData,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import { SppStatsTable } from '@/app/components/SppStatsTable';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { AggregateStatsRow } from '@/app/models/db';

//TODO get year/date range from URL params

export type PageData = {
	speciesStats: AggregateStatsRow[];
	years: number[];
};

async function fetchYears(viewedGroupId: number): Promise<number[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const dates = (await supabase
		.from('Sessions')
		.select('visit_date')
		.eq('ringing_group_id', viewedGroupId)
		.order('visit_date', { ascending: false })
		.then(catchSupabaseErrors)) as { visit_date: string }[];

	return [
		...new Set(dates.map((date) => new Date(date.visit_date).getFullYear()))
	] as number[];
}

async function fetchInitialPageData(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<PageData> {
	const [speciesStats, years] = await Promise.all([
		fetchSpeciesData(viewedGroupId),
		fetchYears(viewedGroupId)
	]);
	return {
		speciesStats,
		years
	};
}

export default async function AllSpeciesPage({
	viewedGroupId
}: {
	viewedGroupId?: number;
} = {}) {
	return (
		<BootstrapPageData<PageData>
			viewedGroupId={viewedGroupId}
			getCacheKeys={() => ['species']}
			dataFetcher={fetchInitialPageData}
			PageComponent={SppStatsTable}
		/>
	);
}
