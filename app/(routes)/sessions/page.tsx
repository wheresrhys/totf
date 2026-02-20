import { SessionHistoryCalendar } from '@/app/components/SessionHistoryCalendar';
import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import type { SessionWithEncountersCount } from '@/app/models/session';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';

export async function fetchAllSessions(): Promise<SessionWithEncountersCount[]> {
	return supabase
		.from('Sessions')
		.select('id, visit_date, encounters:Encounters(count)')
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
