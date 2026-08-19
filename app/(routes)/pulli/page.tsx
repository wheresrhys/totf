import { PulliEncounter } from '@/app/models/session';
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
import { PulliEncountersTable } from '@/app/components/PulliEncountersTable';

export async function fetchPulliEncounters(
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

function ListPulliEncounters({ data }: { data: PulliEncounter[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Pulli</PrimaryHeading>
			<PulliEncountersTable data={data} />
		</PageWrapper>
	);
}

export default async function PulliPage({
	viewedGroup
}: {
	viewedGroupId?: number;
	viewedGroup?: ViewedGroup;
} = {}) {
	return (
		<BootstrapPageData<PulliEncounter[]>
			viewedGroup={viewedGroup}
			getCacheKeys={() => ['pulli']}
			dataFetcher={fetchPulliEncounters}
			PageComponent={ListPulliEncounters}
		/>
	);
}
