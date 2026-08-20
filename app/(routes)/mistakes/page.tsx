import { DiscrepenciesResult } from '@/app/models/db';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	BootstrapPageData,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { MistakesTable } from '@/app/components/MistakesTable';

export async function fetchMistakes(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<DiscrepenciesResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('find_discrepencies', { ringing_group_filter: viewedGroupId })
		.then(catchSupabaseErrors) as Promise<DiscrepenciesResult[]>;
}

function ListMistakes({ data }: { data: DiscrepenciesResult[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Mistakes</PrimaryHeading>
			<MistakesTable mistakes={data} />
		</PageWrapper>
	);
}
export default async function MistakesPage({
	viewedGroup
}: {
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPageData<DiscrepenciesResult[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['mistakes']}
			dataFetcher={fetchMistakes}
			PageComponent={ListMistakes}
		/>
	);
}
