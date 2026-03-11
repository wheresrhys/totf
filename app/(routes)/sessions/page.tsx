import { SessionHistoryCalendar } from '@/app/components/SessionHistoryCalendar';
import {
	BootstrapPageData,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import type { SessionWithEncountersCount } from '@/app/models/session';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';

export async function fetchAllSessions(
	params: DefaultPageParams,
	groupId: number
): Promise<SessionWithEncountersCount[]> {
	return supabase
		.from('Sessions')
		.select(
			'id, visit_date, location: Locations(id, location_name), encounters:Encounters(count)'
		)
		.eq('ringing_group_id', groupId)
		.order('visit_date', { ascending: false })
		.then(catchSupabaseErrors) as Promise<SessionWithEncountersCount[]>;
}

function ListAllSessions({ data }: { data: SessionWithEncountersCount[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Session history</PrimaryHeading>
			<SessionHistoryCalendar sessions={data} />
		</PageWrapper>
	);
}

export default async function SessionsPage() {
	return (
		<BootstrapPageData<SessionWithEncountersCount[]>
			getCacheKeys={() => ['sessions']}
			dataFetcher={fetchAllSessions}
			PageComponent={ListAllSessions}
		/>
	);
}
