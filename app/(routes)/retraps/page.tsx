import { NotableRetrapsResult } from '@/app/models/db';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import {
	BootstrapPageData,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { NotableRetrapsTable } from '@/app/components/NotableRetrapsTable';

export async function fetchNotableRetraps(
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

function ListNotableRetraps({ data }: { data: NotableRetrapsResult[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Notable Birds</PrimaryHeading>
			<NotableRetrapsTable data={data} />
		</PageWrapper>
	);
}
export default async function NotableRetrapsPage({
	viewedGroupId
}: {
	viewedGroupId?: number;
} = {}) {
	return (
		<BootstrapPageData<NotableRetrapsResult[]>
			viewedGroupId={viewedGroupId}
			getCacheKeys={() => ['notable-retraps']}
			dataFetcher={fetchNotableRetraps}
			PageComponent={ListNotableRetraps}
		/>
	);
}
