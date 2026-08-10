import { ResightingEncounter } from '@/app/models/session';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { RESIGHTING_RECORD_TYPES } from '@/lib/demon-import';
import {
	BootstrapPageData,
	DefaultPageParams
} from '@/app/components/layout/BootstrapPageData';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { ResightingsTable } from '@/app/components/ResightingsTable';

export async function fetchResightings(
	_: DefaultPageParams,
	viewedGroupId: number
): Promise<ResightingEncounter[]> {
	const supabase = await getAuthenticatedSupabaseClient();
	return supabase
		.from('Encounters')
		.select(
			`
			id,
			record_type,
			extra_text,
			bird:Birds (
				ring_no,
				species:Species (
					species_name
				)
			),
			session:Sessions (
				visit_date,
				location:Locations (
					location_name
				)
			)
		`
		)
		.eq('ringing_group_id', viewedGroupId)
		.in('record_type', [...RESIGHTING_RECORD_TYPES])
		.then(catchSupabaseErrors) as Promise<ResightingEncounter[]>;
}

function ListResightings({ data }: { data: ResightingEncounter[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Resightings</PrimaryHeading>
			<ResightingsTable resightings={data} />
		</PageWrapper>
	);
}

export default async function ResightingsPage({
	viewedGroupId
}: {
	viewedGroupId?: number;
} = {}) {
	return (
		<BootstrapPageData<ResightingEncounter[]>
			viewedGroupId={viewedGroupId}
			getCacheKeys={() => ['resightings']}
			dataFetcher={fetchResightings}
			PageComponent={ListResightings}
		/>
	);
}
