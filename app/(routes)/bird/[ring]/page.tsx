import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import { SingleBirdTable } from '@/app/components/SingleBirdTable';
import { format as formatDate } from 'date-fns';
import {
	BadgeList,
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import {
	enrichBird,
	type EnrichedStandaloneBird,
	type StandaloneBird
} from '@/app/models/bird';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';

type PageParams = { ring: string };
type PageProps = { params: Promise<PageParams> };

async function fetchBirdData({ ring }: PageParams) {
	const data = (await supabase
		.from('Birds')
		.select(
			`
			id,
			ring_no,
			species:Species (
				species_name
			),
			encounters:Encounters (
				id,
				age_code,
				is_juv,
				capture_time,
				minimum_years,
				record_type,
				sex,
				weight,
				wing_length,
				session:Sessions(
					visit_date
				)
		)
	`
		)
		.eq('ring_no', ring)
		.maybeSingle()
		.then(catchSupabaseErrors)) as StandaloneBird;

	if (!data) {
		return null;
	}

	return enrichBird(data) as EnrichedStandaloneBird;
}

function BirdSummary({
	params: { ring },
	data: bird
}: {
	params: PageParams;
	data: EnrichedStandaloneBird;
}) {
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
			<BadgeList
				testId="bird-stats"
				items={[
					`${bird.encounters.length} encounters`,
					`First: ${formatDate(bird.firstEncounterDate, 'dd MMMM yyyy')}`,
					`Last: ${formatDate(bird.lastEncounterDate, 'dd MMMM yyyy')}`,
					`Sex: ${bird.sex}${bird.sexCertainty < 0.5 ? `?` : ''}`,
					`Proven Age: ${bird.provenAge}`
				]}
			/>
			<SingleBirdTable encounters={bird.encounters} />
		</PageWrapper>
	);
}

export default async function BirdPage(props: PageProps) {
	return (
		<BootstrapPageData<EnrichedStandaloneBird, PageProps, PageParams>
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
