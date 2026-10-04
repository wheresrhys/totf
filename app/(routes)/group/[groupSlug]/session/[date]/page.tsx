import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { withGroupScope } from '@/app/components/layout/withGroupScope';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { RESIGHTING_RECORD_TYPES } from '@/lib/demon-import';
import {
	prefetchActiveTabData,
	readTabIdSearchParam
} from '@/app/lib/tab-query-param';
import { sessionTabPrefetchers } from '@/app/components/pages/session/session-tab-config';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { SessionEncounter } from '@/app/models/session';
import type { LocationRow } from '@/app/models/db';
import {
	SessionPageContent,
	type AdjacentSessionDates,
	type DayData,
	type PageParams
} from './PageContent';

// PostgREST's `not.in` filter wants a parenthesised, comma-joined value list.
// Resighting/recovery-type encounters (`record_type` in ('U','F','D')) are
// excluded from every stats/summary page, so the session page excludes them too
// — including them here is what made session totals disagree with the summary
// totals (#1020).
const RESIGHTING_RECORD_TYPES_FILTER_LIST = `(${RESIGHTING_RECORD_TYPES.join(',')})`;

/**
 * An `Encounters` row as this page selects it: the shared `SessionEncounter`
 * shape plus the encounter's own embedded `Locations` row, which the page's
 * locations info strip is derived from.
 */
type SessionPageEncounter = SessionEncounter & { location: LocationRow };

async function fetchAdjacentSessionDates(
	supabase: Awaited<ReturnType<typeof getAuthenticatedSupabaseClient>>,
	viewedGroupId: number,
	date: string
): Promise<AdjacentSessionDates> {
	const [previousResult, nextResult] = await Promise.all([
		supabase
			.from('Encounters')
			.select('visit_date')
			.eq('ringing_group_id', viewedGroupId)
			.not('record_type', 'in', RESIGHTING_RECORD_TYPES_FILTER_LIST)
			.lt('visit_date', date)
			.order('visit_date', { ascending: false })
			.limit(1)
			.then(catchSupabaseErrors) as Promise<{ visit_date: string }[]>,
		supabase
			.from('Encounters')
			.select('visit_date')
			.eq('ringing_group_id', viewedGroupId)
			.not('record_type', 'in', RESIGHTING_RECORD_TYPES_FILTER_LIST)
			.gt('visit_date', date)
			.order('visit_date', { ascending: true })
			.limit(1)
			.then(catchSupabaseErrors) as Promise<{ visit_date: string }[]>
	]);
	return {
		previousSessionDate: previousResult?.[0]?.visit_date ?? null,
		nextSessionDate: nextResult?.[0]?.visit_date ?? null
	};
}

async function fetchDayEncounters(
	supabase: Awaited<ReturnType<typeof getAuthenticatedSupabaseClient>>,
	viewedGroupId: number,
	date: string
): Promise<SessionPageEncounter[]> {
	// TODO switch back to querying by session once sessions
	// are one per day
	return (await supabase
		.from('Encounters')
		.select(
			`
			id,
			session_id,
			location_id,
			visit_date,
			age_code,
			is_juv,
			breeding_condition,
			capture_method,
			capture_time,
			fat,
			moult_code,
			old_greater_coverts,
			pectoral_muscle,
			primary_moult,
			record_type,
			ringing_group_id,
			sex,
			sexing_method,
			weight,
			wing_length,
			location:Locations (
				id,
				location_name,
				ringing_group_id
			),
			bird:Birds (
				ring_no,
				proven_age,
				species:Species (
					id,
					species_name
				)
		)
	`
		)
		.eq('ringing_group_id', viewedGroupId)
		.eq('visit_date', date)
		.not('record_type', 'in', RESIGHTING_RECORD_TYPES_FILTER_LIST)
		.order('capture_time', { ascending: true })
		.order('bird(ring_no)', { ascending: true })
		.then(catchSupabaseErrors)) as SessionPageEncounter[];
}

/**
 * The distinct locations a day's encounters were caught at, name-ordered — a
 * display-only info strip, not a filter (there is no location-scoped session
 * view any more, #1020).
 */
function collectDistinctLocations(
	encounters: SessionPageEncounter[]
): LocationRow[] {
	const locationsById = new Map<number, LocationRow>();
	encounters.forEach(({ location }) => {
		if (location) {
			locationsById.set(location.id, location);
		}
	});
	return [...locationsById.values()].sort((a, b) =>
		a.location_name.localeCompare(b.location_name)
	);
}

export async function fetchSessionPageContent({
	viewedGroupId,
	date
}: PageParams): Promise<DayData | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	const [encounters, adjacentSessionDates] = await Promise.all([
		fetchDayEncounters(supabase, viewedGroupId, date),
		fetchAdjacentSessionDates(supabase, viewedGroupId, date)
	]);

	return {
		encounters: encounters ?? [],
		locations: collectDistinctLocations(encounters ?? []),
		adjacentSessionDates
	};
}

type PageProps = { params: Promise<{ groupSlug: string; date: string }> };

/**
 * Resolve the `?tabId=` deep link and, when it names a tab that fetches its
 * own data, fetch that data here rather than letting the tab fetch it again
 * after hydration (#1059).
 *
 * The prefetch doesn't need the day's encounters, even though the tab list
 * does: Highlights is the only tab with a `dataFetcher`, and it can never be a
 * day's *default* tab (it always sits last, behind the always-present Net
 * rounds tab). So the active tab is only ever prefetchable when the URL asked
 * for it by name — and `prefetchActiveTabData` already returns `undefined` for
 * any id it doesn't recognise, which covers a garbage `?tabId=` too.
 */
async function resolveSessionTabParams(
	date: string,
	viewedGroup: ViewedGroup,
	searchParams?: Promise<{ tabId?: string }>
): Promise<Pick<PageParams, 'tabId' | 'prefetchedTabData'>> {
	const tabId = await readTabIdSearchParam(searchParams);
	if (!tabId) {
		return { tabId };
	}
	return {
		tabId,
		prefetchedTabData: await prefetchActiveTabData(
			sessionTabPrefetchers,
			tabId,
			{ date },
			viewedGroup
		)
	};
}

export default withGroupScope<{ date: string }>(
	({ viewedGroup, params, searchParams }) => (
		<BootstrapPage<DayData, PageProps, PageParams>
			viewedGroup={viewedGroup}
			getParams={async () => ({
				viewedGroupId: viewedGroup.id,
				date: params.date,
				...(await resolveSessionTabParams(
					params.date,
					viewedGroup,
					searchParams
				))
			})}
			getCacheKeys={() => ['session', params.date]}
			dataFetcher={fetchSessionPageContent}
			PageComponent={SessionPageContent}
			ttl={3600 * 24 * 7}
		/>
	)
);
