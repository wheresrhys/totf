import { notFound } from 'next/navigation';
import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import { resolveGroupIdBySlug } from '@/lib/group-slug';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { SessionEncounter } from '@/app/models/session';
import type { LocationRow, SessionRow } from '@/app/models/db';
import {
	SessionPageContent,
	type AdjacentSessionDates,
	type DayData,
	type PageParams
} from './PageContent';

async function fetchAdjacentSessionDates(
	supabase: Awaited<ReturnType<typeof getAuthenticatedSupabaseClient>>,
	viewedGroupId: number,
	date: string
): Promise<AdjacentSessionDates> {
	const [previousResult, nextResult] = await Promise.all([
		supabase
			.from('Sessions')
			.select('visit_date')
			.eq('ringing_group_id', viewedGroupId)
			.eq('session_type', 'FULL_GROWN')
			.lt('visit_date', date)
			.order('visit_date', { ascending: false })
			.limit(1)
			.then(catchSupabaseErrors) as Promise<{ visit_date: string }[]>,
		supabase
			.from('Sessions')
			.select('visit_date')
			.eq('ringing_group_id', viewedGroupId)
			.eq('session_type', 'FULL_GROWN')
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

export async function fetchSessionPageContent({
	viewedGroupId,
	date,
	locationId
}: PageParams): Promise<DayData | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	let sessions = (await supabase
		.from('Sessions')
		.select(
			'id, location_id, location:Locations (id, location_name, ringing_group_id)'
		)
		.eq('visit_date', date)
		.eq('ringing_group_id', viewedGroupId)
		.eq('session_type', 'FULL_GROWN')
		.then(catchSupabaseErrors)) as (SessionRow & { location: LocationRow })[];

	if (!sessions || sessions.length === 0) {
		return {
			encounters: [],
			locations: [],
			adjacentSessionDates: await fetchAdjacentSessionDates(
				supabase,
				viewedGroupId,
				date
			)
		};
	}
	const locations = sessions.map((item) => item.location);
	const adjacentSessionDates = await fetchAdjacentSessionDates(
		supabase,
		viewedGroupId,
		date
	);
	if (locationId) {
		sessions = sessions.filter((item) => item.location_id === locationId);
		if (sessions.length === 0) {
			return { encounters: [], locations: [], adjacentSessionDates };
		}
	}

	const encounters = (await supabase
		.from('Encounters')
		.select(
			`
			id,
			session_id,
			age_code,
			is_juv,
			breeding_condition,
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
		.in(
			'session_id',
			sessions.map((session) => session.id)
		)
		.eq('ringing_group_id', viewedGroupId)
		.then(catchSupabaseErrors)) as SessionEncounter[];

	return {
		encounters,
		locations,
		adjacentSessionDates
	};
}

type PageProps = { params: Promise<{ groupSlug: string; date: string }> };

export default async function GroupSessionPage({ params }: PageProps) {
	const { groupSlug, date } = await params;
	const viewedGroupId = await resolveGroupIdBySlug(groupSlug);
	if (viewedGroupId === null) {
		notFound();
	}
	const viewedGroup = { id: viewedGroupId, slug: groupSlug };
	return (
		<BootstrapPage<DayData, PageProps, PageParams>
			viewedGroup={viewedGroup}
			getParams={async () => ({
				viewedGroupId,
				date,
				locationId: undefined
			})}
			getCacheKeys={() => ['session', date]}
			dataFetcher={fetchSessionPageContent}
			PageComponent={SessionPageContent}
			ttl={3600 * 24 * 7}
		/>
	);
}
