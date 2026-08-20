import { SessionHistoryCalendar } from '@/app/components/SessionHistoryCalendar';
import {
	BootstrapPageData,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/lib/group-slug';
import type { SessionWithEncountersCount } from '@/app/models/session';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';

export async function fetchAllSessions(
	params: DefaultPageParams,
	viewedGroupId: number
): Promise<SessionWithEncountersCount[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.from('Sessions')
		.select(
			'id, visit_date, location: Locations(id, location_name), encounters:Encounters(count)'
		)
		.eq('ringing_group_id', viewedGroupId)
		.eq('session_type', 'FULL_GROWN')
		.order('visit_date', { ascending: false })
		.then(catchSupabaseErrors) as Promise<SessionWithEncountersCount[]>;
}

function ListAllSessions({
	data,
	viewedGroup
}: {
	data: SessionWithEncountersCount[];
	viewedGroup: ViewedGroup;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>Session history</PrimaryHeading>
			<SessionHistoryCalendar sessions={data} viewedGroup={viewedGroup} />
		</PageWrapper>
	);
}

export default async function SessionsPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPageData<SessionWithEncountersCount[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['sessions']}
			dataFetcher={fetchAllSessions}
			PageComponent={ListAllSessions}
		/>
	);
}
