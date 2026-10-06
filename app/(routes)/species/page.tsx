import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { SppStatsTable } from '@/app/components/pages/species/SppStatsTable';
import { fetchSpeciesData } from '@/app/actions/spp-data';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import {
	computeEffectiveDateRange,
	type TemporalSelection
} from '@/app/lib/temporal-filter';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';

// The `TemporalFilterControls` selection (#1051/#1073), read off `?year=`/
// `?month=`/`?fromDate=`/`?toDate=`. Unlike Summary/species-detail, this page
// has no year/month path-param routing of its own, so every filter field
// lives in the query string via `TemporalFilterControls`' default navigation
// (no `navigationController` override — see `SppStatsTable`).
export type PageParams = TemporalSelection;
type PageProps = {
	// `tabId` isn't read by this page (it has no tabs) — carried on the type
	// only so it shares a key with `withGroupScope`'s `GroupScopeContext`
	// (`Promise<{tabId?: string}>`), which the group-scoped variant forwards
	// unmodified: TypeScript's "weak type" check otherwise rejects that
	// assignment outright when two all-optional object types share *no*
	// properties at all (every `app/(routes)/group/**` page threading extra
	// search params through `withGroupScope` needs the same key-overlap, not
	// just this one).
	searchParams?: Promise<{
		tabId?: string;
		year?: string;
		month?: string;
		fromDate?: string;
		toDate?: string;
	}>;
};

export type PageData = {
	speciesStats: SpeciesStatsRow[];
	years: number[];
	// Echoes the resolved selection back so `SppStatsTable` can seed
	// `TemporalFilterControls` from the current URL instead of resetting on
	// every navigation.
	selection: TemporalSelection;
};

async function getSpeciesListPageParams(
	pageProps: PageProps
): Promise<PageParams> {
	const searchParams = (await pageProps.searchParams) ?? {};
	return {
		...(searchParams.year ? { year: Number(searchParams.year) } : {}),
		...(searchParams.month ? { month: Number(searchParams.month) } : {}),
		...(searchParams.fromDate ? { fromDate: searchParams.fromDate } : {}),
		...(searchParams.toDate ? { toDate: searchParams.toDate } : {})
	};
}

export async function fetchYears(viewedGroup: ViewedGroup): Promise<number[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const dates = (await supabase
		.from('Sessions')
		.select('visit_date')
		.eq('ringing_group_id', viewedGroup.id)
		.order('visit_date', { ascending: false })
		.then(catchSupabaseErrors)) as { visit_date: string }[];

	return [
		...new Set(dates.map((date) => new Date(date.visit_date).getFullYear()))
	] as number[];
}

export async function fetchSpeciesListPageContent(
	params: PageParams,
	viewedGroup: ViewedGroup
): Promise<PageData> {
	// A bare month (no year) comes back as `recurringMonth` rather than
	// `fromDate`/`toDate` bounds (#1051) — this page's data comes from the
	// `core_stats`/`biometrics_stats` RPCs via `fetchSpeciesData`, which apply
	// it as `month_filter` (independent of `from_date`/`to_date`), so it's
	// passed straight through rather than routed around the
	// `applyTemporalFilter` throw that only applies to direct-table-query call
	// sites.
	const effectiveRange = computeEffectiveDateRange(params) ?? {};
	const [speciesStats, years] = await Promise.all([
		fetchSpeciesData(
			viewedGroup,
			effectiveRange.fromDate,
			effectiveRange.toDate,
			effectiveRange.recurringMonth
		),
		fetchYears(viewedGroup)
	]);
	return {
		speciesStats,
		years,
		selection: params
	};
}

export default async function AllSpeciesPage({
	viewedGroup,
	searchParams
}: {
	viewedGroup?: ViewedGroup;
	searchParams?: PageProps['searchParams'];
} = {}) {
	return (
		<BootstrapPage<PageData, PageProps, PageParams>
			pageProps={{ searchParams }}
			viewedGroup={viewedGroup}
			getParams={getSpeciesListPageParams}
			getCacheKeys={(params) => ['species', JSON.stringify(params)]}
			dataFetcher={fetchSpeciesListPageContent}
			PageComponent={SppStatsTable}
		/>
	);
}
