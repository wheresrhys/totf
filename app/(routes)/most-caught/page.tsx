import { MostCaughtResult } from '@/app/models/db';
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
import { MostCaughtTable } from '@/app/components/MostCaughtTable';

export async function fetchMostCaught(
	_: DefaultPageParams,
	groupId: number
): Promise<MostCaughtResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('most_caught_birds', {
			ringing_group_filter: groupId,
			significance_threshold: 3
		})
		.then(catchSupabaseErrors) as Promise<MostCaughtResult[]>;
}

function ListMostCaught({ data }: { data: MostCaughtResult[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Most Caught Birds</PrimaryHeading>
			<MostCaughtTable data={data} />
		</PageWrapper>
	);
}
export default async function MostCaughtPage() {
	return (
		<BootstrapPageData<MostCaughtResult[]>
			getCacheKeys={() => ['most-caught']}
			dataFetcher={fetchMostCaught}
			PageComponent={ListMostCaught}
		/>
	);
}
