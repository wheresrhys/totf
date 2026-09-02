import { BootstrapPage } from '@/app/components/layout/BootstrapPage';
import type { ViewedGroup } from '@/lib/group-slug';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { StandaloneBird, EncounterOfBird } from '@/app/models/bird';
import { BirdPageContent, type PageParams } from './PageContent';

export async function fetchBirdPageContent({ ring }: PageParams) {
	const supabase = await getAuthenticatedSupabaseClient();
	const bird = (await supabase
		.from('Birds')
		.select(
			`id,
			ring_no,
			proven_age,
			species:Species (
				species_name
			)
		`
		)
		.eq('ring_no', ring)
		.maybeSingle()
		.then(catchSupabaseErrors)) as StandaloneBird;

	if (!bird) {
		return null;
	}

	const encounters = (await supabase
		.from('Encounters')
		.select(
			`
				bird_id,
				id,
				age_code,
				breeding_condition,
				is_juv,
				capture_time,
				max_hatch_year,
				min_hatch_year,
				moult_code,
				record_type,
				sex,
				sexing_method,
				ringing_group_id,
				weight,
				wing_length,
				session:Sessions(
					visit_date
				)
	`
		)
		.eq('bird_id', bird.id)
		.then(catchSupabaseErrors)) as EncounterOfBird[];

	return { ...bird, encounters } as StandaloneBird;
}

type PageProps = { params: Promise<PageParams> };

export default async function BirdPage(
	props: PageProps & { viewedGroup?: ViewedGroup }
) {
	return (
		<BootstrapPage<StandaloneBird, PageProps, PageParams>
			pageProps={props}
			viewedGroup={props.viewedGroup}
			getParams={async (pageProps: PageProps) => ({
				ring: (await pageProps.params).ring.toUpperCase()
			})}
			getCacheKeys={(params: PageParams) => ['bird', params.ring]}
			dataFetcher={fetchBirdPageContent}
			PageComponent={BirdPageContent}
		/>
	);
}
