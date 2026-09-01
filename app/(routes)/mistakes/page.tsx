import { DiscrepenciesResult } from '@/app/models/db';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	BootstrapPage,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import { MistakesPageContent } from './PageContent';

export async function fetchMistakesPageContent(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<DiscrepenciesResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('find_discrepencies', { ringing_group_filter: viewedGroupId })
		.then(catchSupabaseErrors) as Promise<DiscrepenciesResult[]>;
}

export default async function MistakesPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<DiscrepenciesResult[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['mistakes']}
			dataFetcher={fetchMistakesPageContent}
			PageComponent={MistakesPageContent}
		/>
	);
}
