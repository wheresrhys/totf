import { GroupTicksResult } from '@/app/models/db';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	BootstrapPage,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import { TicksPageContent } from './PageContent';

export async function fetchTicksPageContent(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<GroupTicksResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('group_ticks', { ringing_group_filter: viewedGroupId })
		.then(catchSupabaseErrors) as Promise<GroupTicksResult[]>;
}

export default async function TicksPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPage<GroupTicksResult[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['ticks']}
			dataFetcher={fetchTicksPageContent}
			PageComponent={TicksPageContent}
		/>
	);
}
