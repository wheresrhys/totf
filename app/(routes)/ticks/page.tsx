import { GroupTicksResult } from '@/app/models/db';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { ViewedGroup } from '@/lib/group-slug';
import {
	BootstrapPage,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPage';
import {
	BoxyList,
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { format as formatDate } from 'date-fns';

export async function fetchGroupTicks(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<GroupTicksResult[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.rpc('group_ticks', { ringing_group_filter: viewedGroupId })
		.then(catchSupabaseErrors) as Promise<GroupTicksResult[]>;
}

function ListTicks({ data }: { data: GroupTicksResult[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Ticks</PrimaryHeading>
			{data.length === 0 ? (
				<p>No ticks yet.</p>
			) : (
				<BoxyList>
					{data.map((tick) => (
						<li key={`${tick.species_name}-${tick.first_encounter_date}`}>
							{tick.species_name} on{' '}
							{formatDate(new Date(tick.first_encounter_date), 'do MMMM yyyy')}
						</li>
					))}
				</BoxyList>
			)}
		</PageWrapper>
	);
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
			dataFetcher={fetchGroupTicks}
			PageComponent={ListTicks}
		/>
	);
}
