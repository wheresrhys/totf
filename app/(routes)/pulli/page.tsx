import { PulliEncounter } from '@/app/models/session';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	BootstrapPage,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import { pulliEncountersQuery } from '@/queries';
import { PulliPageContent } from './PageContent';

export async function fetchPulliPageContent(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<PulliEncounter[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.from('Encounters')
		.select(pulliEncountersQuery.select)
		.eq('ringing_group_id', viewedGroupId)
		.eq('session.session_type', 'PULLI')
		.then(catchSupabaseErrors) as Promise<PulliEncounter[]>;
}

export default async function PulliPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<PulliEncounter[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['pulli']}
			dataFetcher={fetchPulliPageContent}
			PageComponent={PulliPageContent}
		/>
	);
}
