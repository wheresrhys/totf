import {
	BootstrapPage,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { RESIGHTING_RECORD_TYPES } from '@/lib/demon-import';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { SessionWithEncountersCount } from '@/app/models/session';
import { allSessionsQuery } from '@/queries';
import { SessionsPageContent } from './PageContent';

// PostgREST's `not.in` filter wants a parenthesised, comma-joined value list
// (same convention as the session page, app/(routes)/group/[groupSlug]/session/[date]/page.tsx).
const RESIGHTING_RECORD_TYPES_FILTER_LIST = `(${RESIGHTING_RECORD_TYPES.join(',')})`;

/**
 * The list used to show only FULL_GROWN-type sessions (`Sessions.session_type`),
 * excluding PULLI and FIELD_OBSERVATION sessions from the calendar. That column
 * is gone as of #1024, and this re-expresses the same bucketing rule
 * `lib/demon-import.ts` used to assign a row's session_type with, directly off
 * `Encounters` columns: not a resighting/recovery record (`record_type` in
 * `RESIGHTING_RECORD_TYPES` — that would have made it FIELD_OBSERVATION), and
 * not a pullus capture (`age_code === 1 && !is_juv` — that would have made it
 * PULLI).
 *
 * Expressed as a second, non-aggregate `!inner` embed of `Encounters`
 * (`qualifying`) purely to gate which `Sessions` rows survive, kept separate
 * from the plain `encounters:Encounters(count)` embed used for the displayed
 * count — PostgREST turns an aggregated embed into a LEFT JOIN regardless of
 * `!inner`, so filtering the same aggregated embed would silently stop
 * excluding non-matching sessions (it'd return them with `count: 0` instead).
 *
 * Note what the semantics are now, since #1024 made a Session one row per
 * `(ringing_group_id, visit_date)`: a date qualifies if it carries AT LEAST ONE
 * full-grown capture, and its displayed encounter count covers the whole
 * group-day including any pulli or passive records. While a Session was
 * `(visit_date, location_id, session_type)` its Encounters were homogeneous by
 * construction, so "has a qualifying encounter" and "is a FULL_GROWN session"
 * were the same thing; a group-day Session mixes them, and this filter keeps the
 * date rather than splitting it.
 */
const FULL_GROWN_EQUIVALENT_SELECT = `${allSessionsQuery.select}, qualifying:Encounters!inner(id)`;

export async function fetchSessionsPageContent(
	params: DefaultPageParams,
	viewedGroup: ViewedGroup
): Promise<SessionWithEncountersCount[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.from('Sessions')
		.select(FULL_GROWN_EQUIVALENT_SELECT)
		.eq('ringing_group_id', viewedGroup.id)
		.not('qualifying.record_type', 'in', RESIGHTING_RECORD_TYPES_FILTER_LIST)
		.or('age_code.neq.1,is_juv.eq.true', { referencedTable: 'qualifying' })
		.order('visit_date', { ascending: false })
		.then(catchSupabaseErrors) as Promise<SessionWithEncountersCount[]>;
}

export default async function SessionsPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<SessionWithEncountersCount[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['sessions']}
			dataFetcher={fetchSessionsPageContent}
			PageComponent={SessionsPageContent}
		/>
	);
}
