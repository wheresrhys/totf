import { PulliEncounter } from '@/app/models/session';
import { getAuthenticatedSupabaseClient } from '@/app/lib/auth/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { RESIGHTING_RECORD_TYPES } from '@/lib/demon-import';
import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	BootstrapPage,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import { pulliEncountersQuery } from '@/queries';
import { PulliPageContent } from './PageContent';

// Reproduces `Sessions.session_type = 'PULLI'` directly over `Encounters`
// columns (record_type/age_code/is_juv, all on Encounters post-#1015) instead
// of joining to `Sessions.session_type` — confirmed exact mechanical
// equivalence, see
// https://github.com/wheresrhys/totf/issues/1024#issuecomment-5930001521.
export async function fetchPulliPageContent(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<PulliEncounter[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.from('Encounters')
		.select(pulliEncountersQuery.select)
		.eq('ringing_group_id', viewedGroupId)
		.not('record_type', 'in', `(${RESIGHTING_RECORD_TYPES.join(',')})`)
		.eq('age_code', 1)
		.eq('is_juv', false)
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
