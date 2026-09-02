import { PulliEncounter } from '@/app/models/session';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	BootstrapPage,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import { PulliPageContent } from './PageContent';

export async function fetchPulliPageContent(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<PulliEncounter[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.from('Encounters')
		.select(
			`
			id,
			extra_text,
			bird:Birds (
				ring_no,
				species:Species (
					species_name
				)
			),
			session:Sessions!inner (
				visit_date,
				session_type,
				location:Locations (
					location_name
				)
			)
		`
		)
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
