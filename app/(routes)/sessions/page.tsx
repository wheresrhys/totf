import { SessionHistoryCalendar } from '@/app/components/SessionHistoryCalendar';
import {
	BootstrapPageData,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
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
		.order('visit_date', { ascending: false })
		.then(catchSupabaseErrors) as Promise<SessionWithEncountersCount[]>;
}

function ListAllSessions({
	data,
	viewedGroupId
}: {
	data: SessionWithEncountersCount[];
	viewedGroupId: number;
}) {
	return (
		<PageWrapper>
			<PrimaryHeading>Session history</PrimaryHeading>
			<SessionHistoryCalendar sessions={data} viewedGroupId={viewedGroupId} />
		</PageWrapper>
	);
}

export default async function SessionsPage({
	viewedGroupId
}: {
	viewedGroupId?: number;
} = {}) {
	return (
		<BootstrapPageData<SessionWithEncountersCount[]>
			viewedGroupId={viewedGroupId}
			getCacheKeys={() => ['sessions']}
			dataFetcher={fetchAllSessions}
			PageComponent={ListAllSessions}
		/>
	);
}
