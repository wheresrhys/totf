import {
	BootstrapPage,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import { SppStatsTable } from '@/app/components/pages/species/SppStatsTable';
import { fetchSpeciesDataWithAccessLevel } from '@/app/actions/spp-data';
import {
	fetchAuthorisedCoreStats,
	type GroupSummaryAccessLevel
} from '@/app/lib/auth/group-summary-access';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';

//TODO get year/date range from URL params

export type PageData = {
	speciesStats: SpeciesStatsRow[];
	years: number[];
	accessLevel: GroupSummaryAccessLevel;
};

/**
 * The years the year-select offers, newest first.
 *
 * Read through `fetchAuthorisedCoreStats`' year grain rather than straight off
 * `Sessions` (#1231). The old query called `getAuthenticatedSupabaseClient()`
 * unconditionally, so it threw `'No group selected'` for a cookie-less caller
 * — which made the whole page unreachable anonymously, even once the access
 * gate let the request through. Going via the summary read path instead reuses
 * its 4-branch access model verbatim: an own-group or `GroupDataSharing`
 * viewer reads the `SimpleStatsCache` year cells authenticated, and an
 * anonymous visitor to a `public_areas: ['summary']` group reads the same
 * cells through the plain `anon` client, which that table's SELECT policy
 * admits (#1202). No `Sessions` RLS widening was needed.
 *
 * `session_count` is `COUNT(DISTINCT visit_date)` over the stats RPC family's
 * filtered row source, so the filter below is what keeps the list sparse:
 * `stats_spine`'s year grain is a *dense* series between the group's first and
 * last session, so a group with a gap year has a cache cell for it carrying
 * zeroes. Two consequences versus the old `Sessions` read, both deliberate: a
 * gap year is still excluded, and a year whose only ringing day recorded
 * nothing but resightings (excluded from `stats_raw_encounters`, #874) now
 * drops out too — selecting it could only ever have shown an empty table.
 */
export async function fetchYears(viewedGroup: ViewedGroup): Promise<number[]> {
	const { rows } = await fetchAuthorisedCoreStats(viewedGroup, {
		group_by_time_period: 'year'
	});

	return [
		...new Set(
			rows
				.filter((row) => row.session_count > 0)
				// `time_period` is a `date` column PostgREST serialises as
				// `YYYY-MM-DD`; read the year off the string rather than via
				// `new Date(...)`, which would drag the server's timezone into a
				// pure calendar value.
				.map((row) => Number(row.time_period.slice(0, 4)))
		)
	].sort((earlierYear, laterYear) => laterYear - earlierYear);
}

export async function fetchSpeciesListPageContent(
	_: DefaultPageParams,
	viewedGroup: ViewedGroup
): Promise<PageData> {
	const [{ accessLevel, rows: speciesStats }, years] = await Promise.all([
		fetchSpeciesDataWithAccessLevel(viewedGroup),
		fetchYears(viewedGroup)
	]);
	return {
		speciesStats,
		years,
		accessLevel
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
