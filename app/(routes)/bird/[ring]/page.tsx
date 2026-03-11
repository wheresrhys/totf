import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import { SingleBirdTable } from '@/app/components/SingleBirdTable';
import { format as formatDate } from 'date-fns';
import {
	BadgeList,
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import {
	enrichBird,
	type StandaloneBird,
	type EncounterOfBird
} from '@/app/models/bird';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';

type PageParams = { ring: string };
type PageProps = { params: Promise<PageParams> };

async function fetchBirdData({ ring }: PageParams, groupId: number) {
	const supabase = await getAuthenticatedSupabaseClient();
	const bird = (await supabase
		.from('Birds')
		.select(
			`id,
			ring_no,
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
				is_juv,
				capture_time,
				max_hatch_year,
				min_hatch_year,
				record_type,
				sex,
				ringing_group_id,
				weight,
				wing_length,
				session:Sessions(
					visit_date
				)
	`
		)
		.eq('bird_id', bird.id)
		.eq('ringing_group_id', groupId)
		.then(catchSupabaseErrors)) as EncounterOfBird[];

	return { ...bird, encounters } as StandaloneBird;
}

function BirdSummary({
	params: { ring },
	data: bird
}: {
	params: PageParams;
	data: StandaloneBird;
}) {
	const enrichedBird = bird.encounters.length ? enrichBird(bird) : null;
	return (
		<PageWrapper>
			<PrimaryHeading>
				<NoPrefetchLink
					className="link"
					href={`/species/${bird.species?.species_name}`}
				>
					{bird.species?.species_name}
				</NoPrefetchLink>{' '}
				{ring}
			</PrimaryHeading>
			{enrichedBird ? (
				<>
					<BadgeList
						testId="bird-stats"
						items={[
							`${enrichedBird.encounters.length} encounters`,
							`First: ${formatDate(enrichedBird.firstEncounterDate, 'dd MMMM yyyy')}`,
							`Last: ${formatDate(enrichedBird.lastEncounterDate, 'dd MMMM yyyy')}`,
							`Sex: ${enrichedBird.sex}${enrichedBird.sexCertainty < 0.5 ? `?` : ''}`,
							`Proven Age: ${enrichedBird.provenAge}`
						]}
					/>
					<SingleBirdTable encounters={enrichedBird.encounters} />
				</>
			) : (
				<p>Not authorised to access any encounters for this bird</p>
			)}
		</PageWrapper>
	);
}

export default async function BirdPage(props: PageProps) {
	return (
		<BootstrapPageData<StandaloneBird, PageProps, PageParams>
			pageProps={props}
			getParams={async (pageProps: PageProps) => ({
				ring: (await pageProps.params).ring.toUpperCase()
			})}
			getCacheKeys={(params: PageParams) => ['bird', params.ring]}
			dataFetcher={fetchBirdData}
			PageComponent={BirdSummary}
		/>
	);
}
