import {
	BootstrapPage,
	type DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/lib/group-slug';
import type { SessionWithEncountersCount } from '@/app/models/session';
import { SessionsPageContent } from './PageContent';

export async function fetchSessionsPageContent(
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
