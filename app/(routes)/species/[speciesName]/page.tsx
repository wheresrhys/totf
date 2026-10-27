import { endOfMonth, endOfYear, format, parseISO } from 'date-fns';
import {
	BootstrapPage,
	defaultGetParams
} from '@/app/components/layout/BootstrapPage';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import {
	fetchPageOfBirds,
	fetchSpeciesStatsCacheRows
} from '@/app/actions/sp-data';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import {
	readTabIdSearchParam,
	resolveInitialTabId,
	prefetchActiveTabData
} from '@/app/lib/tab-query-param';
import {
	SpeciesPageContent,
	type PageParams,
	type PeriodScope,
	type PageData
} from './PageContent';
// Imported from `./species-tabs` (not `./PageContent`, which is `'use
// client'`) deliberately — see that module's doc comment: calling a function
// exported from a `'use client'` module directly (as this server file does)
// throws at runtime even though it type-checks and unit-tests fine.
import {
	getDefaultSpeciesTabId,
	getSpeciesKnownTabIds,
	buildSpeciesTotalsTabs
} from './species-tabs';

import type { CoreStatsWithBiometrics } from '@/app/models/db';
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

/**
 * The sentinel year `stats_spine`'s `'month-squashed'` branch stamps on a
 * squashed calendar month's `time_period` (`make_date(2000, m, 1)` — see
 * `stats_spine.sql`), and so the year the cache tables store those cells
 * under. `app/lib/auth/group-summary-access.ts`'s own
 * `MONTH_SQUASHED_SENTINEL_YEAR` relies on the same convention; duplicated
 * here rather than imported since that module is private to the group
 * summary read path.
 */
const MONTH_SQUASHED_SENTINEL_YEAR = 2000;

function isWholeCalendarYear(fromDate: string, toDate: string): boolean {
	return (
		fromDate.endsWith('-01-01') &&
		toDate === format(endOfYear(parseISO(fromDate)), 'yyyy-MM-dd')
	);
}

function isWholeCalendarMonth(fromDate: string, toDate: string): boolean {
	return (
		fromDate.endsWith('-01') &&
		toDate === format(endOfMonth(parseISO(fromDate)), 'yyyy-MM-dd')
	);
}

// Fetches the species page's headline stats row from the materialized
// `SimpleStatsCacheBySpecies` table (#1222) — `fetchSpeciesStatsCacheRows`
// (`sp-data.ts`) already returns the merged `CoreStatsWithBiometrics` shape
// per row, so there is no separate biometrics_stats call/merge to do here any
// more (see that file's own doc comment on `mergeBiometricsFields`'s one
// remaining call site). `fromDate`/`toDate`/`monthFilter` are never a
// genuinely arbitrary free-text range here — every caller of
// `fetchSpeciesPageContentForPeriod` passes a `period` that's hardcoded per
// route file (see `PageContent.tsx`'s `PeriodScope` doc comment): all-time (no
// args), a whole calendar year, a whole calendar month, or a squashed-month
// `monthFilter` with no date range — so each maps onto exactly one cache
// grain/cell, with no arbitrary-window fallback needed.
export async function getSpeciesStats(
	species: string,
	viewedGroup: ViewedGroup,
	fromDate?: string,
	toDate?: string,
	monthFilter?: number
): Promise<CoreStatsWithBiometrics[]> {
	if (fromDate && toDate && isWholeCalendarYear(fromDate, toDate)) {
		return fetchSpeciesStatsCacheRows({
			speciesName: species,
			viewedGroup,
			temporalUnit: 'year',
			fromDate,
			toDate: fromDate,
			includeBiometrics: true
		});
	}
	if (fromDate && toDate && isWholeCalendarMonth(fromDate, toDate)) {
		return fetchSpeciesStatsCacheRows({
			speciesName: species,
			viewedGroup,
			temporalUnit: 'month',
			fromDate,
			toDate: fromDate,
			includeBiometrics: true
		});
	}
	if (monthFilter) {
		const squashedMonthTimePeriod = `${MONTH_SQUASHED_SENTINEL_YEAR}-${String(
			monthFilter
		).padStart(2, '0')}-01`;
		return fetchSpeciesStatsCacheRows({
			speciesName: species,
			viewedGroup,
			temporalUnit: 'month-squashed',
			fromDate: squashedMonthTimePeriod,
			toDate: squashedMonthTimePeriod,
			includeBiometrics: true
		});
	}
	return fetchSpeciesStatsCacheRows({
		speciesName: species,
		viewedGroup,
		temporalUnit: 'all-time',
		includeBiometrics: true
	});
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
	viewedGroup: ViewedGroup,
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
	// one of the 6 totals tabs migrated onto `TabSet` (#1065, #1066) — fetch
	// its data right here, server-side, so that tab renders immediately with no
	// loading spinner instead of flashing one and re-fetching on hydration.
	// Highlights is one of the 6 but declares itself `clientSideOnly`
	// (`SpHighlightsTab.tsx`'s `spHighlightsTab`), so `prefetchActiveTabData`
	// still skips it even when it's the resolved tab. Biometrics/Demographics/
	// Bird list aren't on `TabConfig` yet (a follow-up ticket):
	// `prefetchActiveTabData` naturally no-ops for those too, since
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
	const totalsTabs = buildSpeciesTotalsTabs(
		isAllTime,
		isYearScoped,
		isSquashedMonth
	);
	const totalsTabParams: SpeciesTotalsTabParams = {
		speciesName: params.speciesName,
		year,
		// Matches `SpeciesData`'s own `totalsTabParams` in `PageContent.tsx` —
		// see that file's comment on this exact assignment for why it's `year`
		// rather than `month` (a pre-existing quirk in the Highlights tab's
		// param wiring, preserved as-is; #1066 is a pure mechanism migration,
		// not a behaviour change).
		month: year,
		fromDate,
		toDate,
		monthFilter: squashedMonth
	};

	const [birds, speciesStats, initialTabData] = await Promise.all([
		fetchPageOfBirds(speciesId, viewedGroup, 0, fromDate, toDate),
		getSpeciesStats(
			params.speciesName,
			viewedGroup,
			fromDate,
			toDate,
			squashedMonth
		),
		prefetchActiveTabData(totalsTabs, activeTabId, totalsTabParams, viewedGroup)
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
	viewedGroup: ViewedGroup
): Promise<PageData | null> {
	return fetchSpeciesPageContentForPeriod(params, viewedGroup);
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
