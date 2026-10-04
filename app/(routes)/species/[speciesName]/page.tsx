import {
	BootstrapPage,
	defaultGetParams
} from '@/app/components/layout/BootstrapPage';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { fetchPageOfBirds } from '@/app/actions/sp-data';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import {
	readTabIdSearchParam,
	resolveInitialTabId,
	prefetchActiveTabData
} from '@/app/lib/tab-query-param';
import {
	SpeciesPageContent,
	getDefaultSpeciesTabId,
	getSpeciesKnownTabIds,
	buildSpeciesTotalsTabs,
	type PageParams,
	type PeriodScope,
	type PageData
} from './PageContent';

import {
	mergeBiometricsFields,
	type CoreStatsResult,
	type CoreStatsWithBiometrics,
	type BiometricsStatsResult
} from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';

type PageProps = {
	params: Promise<{ speciesName: string }>;
	searchParams?: Promise<{ tabId?: string }>;
};

// Merges the route's `speciesName` with the optional `?tabId=` search param
// (#803) into the shared `PageParams` shape, so the requested tab is known
// before first paint (see PageContent.tsx's `SpeciesData` for how it's
// resolved against the page's known tab ids and seeded as the initial tab).
async function getSpeciesPageParams(pageProps: PageProps): Promise<PageParams> {
	const { speciesName } = await defaultGetParams<
		PageProps,
		{ speciesName: string }
	>(pageProps);
	const tabId = await readTabIdSearchParam(pageProps.searchParams);
	return { speciesName, ...(tabId ? { tabId } : {}) };
}

// Fetches the species page's headline stats row, merging biometrics_stats'
// wing/weight fields onto the core_stats row (#821). Both RPCs share the
// same param shape and, called without group_by_species/group_by_time_period,
// each return exactly one (ungrouped) row for this species/date-range/group,
// so the two rows line up 1:1 without needing a join key.
export async function getSpeciesStats(
	species: string,
	viewedGroupId: number,
	fromDate?: string,
	toDate?: string,
	monthFilter?: number
): Promise<CoreStatsWithBiometrics[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	const rpcArgs = {
		species_name_filter: species,
		ringing_group_filter: viewedGroupId,
		...(fromDate ? { from_date: fromDate } : {}),
		...(toDate ? { to_date: toDate } : {}),
		...(monthFilter ? { month_filter: monthFilter } : {})
	};
	const [aggregateRows, biometricsRows] = await Promise.all([
		supabase.rpc('core_stats', rpcArgs).then(catchSupabaseErrors) as Promise<
			CoreStatsResult[]
		>,
		supabase
			.rpc('biometrics_stats', rpcArgs)
			.then(catchSupabaseErrors) as Promise<BiometricsStatsResult[]>
	]);
	const biometricsRow = biometricsRows[0];
	return aggregateRows.map((aggregateRow) =>
		mergeBiometricsFields(aggregateRow, biometricsRow)
	);
}

// Shared core fetcher for all three species route levels. Given a resolved
// `PeriodScope` it threads the date range into the encounter-level fetchers
// (birds + aggregate stats), and echoes the period back on the returned data
// so the client can build the heading and scope its own tab fetches
// (including the Highlights tab's Busiest sessions section, which fetches
// lazily by year/month rather than eagerly here). The unscoped route passes
// an empty period, reproducing today's all-time behaviour exactly.
export async function fetchSpeciesPageContentForPeriod(
	params: PageParams,
	viewedGroupId: number,
	period: PeriodScope = {}
): Promise<PageData | null> {
	const { year, month, fromDate, toDate, squashedMonth } = period;
	const supabase = await getAuthenticatedSupabaseClient();
	const { id: speciesId } = (await supabase
		.from('Species')
		.select('id')
		.eq('species_name', params.speciesName)
		.single()
		.then(catchSupabaseErrors)) as { id: number };
	if (!speciesId) {
		throw new Error(`Species ${params.speciesName} not found`);
	}

	// Resolve which tab should be focused on first paint (#1059), and — if it's
	// one of the 3 totals tabs already migrated onto `TabSet` (#1065) — fetch
	// its data right here, server-side, so that tab renders immediately with no
	// loading spinner instead of flashing one and re-fetching on hydration. The
	// other 6 species tabs aren't on `TabConfig` yet (follow-ups, including
	// #1060): `prefetchActiveTabData` naturally no-ops for those, since
	// `totalsTabs` below never contains them.
	//
	// `isAllTime`/`isYearScoped`/`isSquashedMonth` are route-depth facts, not
	// fetched ones — every caller of this function passes a `period` that's
	// hardcoded per route file (the bare page below always passes `{}`, its
	// `[yearOrMonth]`/`[yearOrMonth]/[month]` siblings always pass a
	// year/month-shaped one) — so they can be (and are, identically) derived
	// again from `data.year`/`data.squashedMonth`/`data.month` client-side in
	// `PageContent.tsx`'s `SpeciesData`, which doesn't have `period` in scope.
	//
	// Open design note (flag, don't resolve here): this is the first per-tab
	// server-side `dataFetcher` prefetch in the codebase — `buildSpeciesTotalsTabs`
	// lives in `PageContent.tsx` rather than here partly so this file doesn't
	// need to import `SpYearTotalsTab` et al. directly, but it's still reached
	// through that import. Worth revisiting once more pages adopt this pattern:
	// does a page's `TabConfig[]` belong fully colocated with its
	// `PageContent.tsx`, or is some shared "build this page's tab configs"
	// helper the better long-term shape? Leave as-is for now.
	const isAllTime = year === undefined && squashedMonth === undefined;
	const isYearScoped = year !== undefined && month === undefined;
	const isSquashedMonth = squashedMonth !== undefined;
	const defaultTabId = getDefaultSpeciesTabId(
		isAllTime,
		isYearScoped,
		isSquashedMonth
	);
	const knownTabIds = getSpeciesKnownTabIds(
		isAllTime,
		isYearScoped,
		isSquashedMonth
	);
	const activeTabId = resolveInitialTabId(
		params.tabId,
		knownTabIds,
		defaultTabId
	);
	const totalsTabs = buildSpeciesTotalsTabs(isAllTime, isYearScoped);
	const totalsTabParams: SpeciesTotalsTabParams = {
		speciesName: params.speciesName,
		year,
		fromDate,
		toDate,
		monthFilter: squashedMonth
	};

	const [birds, speciesStats, initialTabData] = await Promise.all([
		fetchPageOfBirds(speciesId, viewedGroupId, 0, fromDate, toDate),
		getSpeciesStats(
			params.speciesName,
			viewedGroupId,
			fromDate,
			toDate,
			squashedMonth
		),
		// None of the 3 dataFetchers above ever read `.slug` — only `.id` — so a
		// synthetic `ViewedGroup` avoids widening this function's own signature
		// (shared by every route-depth variant, and fixed by `BootstrapPage`'s
		// `dataFetcher` contract to a plain `viewedGroupId: number`) just to
		// carry a slug this prefetch step never uses.
		prefetchActiveTabData(totalsTabs, activeTabId, totalsTabParams, {
			id: viewedGroupId,
			slug: ''
		})
	]);
	if (birds.length === 0) {
		return {
			speciesId,
			year,
			month,
			fromDate,
			toDate,
			squashedMonth,
			initialTabId: activeTabId,
			initialTabData
		};
	}
	return {
		birds,
		speciesStats: speciesStats[0],
		speciesId,
		speciesName: params.speciesName,
		year,
		month,
		fromDate,
		toDate,
		squashedMonth,
		initialTabId: activeTabId,
		initialTabData
	};
}

export async function fetchSpeciesPageContent(
	params: PageParams,
	viewedGroupId: number
): Promise<PageData | null> {
	return fetchSpeciesPageContentForPeriod(params, viewedGroupId);
}

export default async function SpeciesPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPage<PageData, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={getSpeciesPageParams}
			getCacheKeys={(params: PageParams) => ['species', params.speciesName]}
			dataFetcher={fetchSpeciesPageContent}
			PageComponent={SpeciesPageContent}
		/>
	);
}
