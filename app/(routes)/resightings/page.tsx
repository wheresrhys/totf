import { ResightingEncounter } from '@/app/models/session';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	BootstrapPage,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import { resightingsQuery } from '@/queries';
import { ResightingsPageContent } from './PageContent';

export async function fetchResightingsPageContent(
	_: DefaultPageParams,
	viewedGroup: ViewedGroup
): Promise<ResightingEncounter[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.from('Encounters')
		.select(resightingsQuery.select)
		.eq('ringing_group_id', viewedGroup.id)
		.eq('is_resighting', true)
		.then(catchSupabaseErrors) as Promise<ResightingEncounter[]>;
}

export default async function ResightingsPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<ResightingEncounter[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['resightings']}
			dataFetcher={fetchResightingsPageContent}
			PageComponent={ResightingsPageContent}
		/>
	);
}
