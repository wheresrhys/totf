import { NotableRetrapsResult } from '@/app/models/db';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	BootstrapPage,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import { RetrapsPageContent } from './PageContent';

export async function fetchRetrapsPageContent(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<NotableRetrapsResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('notable_retraps', {
			ringing_group_filter: viewedGroupId,
			result_limit_per_species: 5,
			min_proven_age: 3,
			min_encounter_count: 6
		})
		.then(catchSupabaseErrors) as Promise<NotableRetrapsResult[]>;
}

export default async function RetrapsPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<NotableRetrapsResult[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['notable-retraps']}
			dataFetcher={fetchRetrapsPageContent}
			PageComponent={RetrapsPageContent}
		/>
	);
}
