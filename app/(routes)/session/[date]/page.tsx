import {
	SessionTable,
	type SpeciesWithEncounters
} from '@/app/components/SingleSessionTable';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import type { SessionEncounter } from '@/app/models/session';
import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import {
	BadgeList,
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { format as formatDate } from 'date-fns';

type PageParams = { date: string };
type PageProps = { params: Promise<PageParams> };

async function fetchSessionData({
	date
}: PageParams): Promise<SessionEncounter[] | null> {
	const data = (await supabase
		.from('Sessions')
		.select(
			`
		id,
		encounters:Encounters(
			id,
			session_id,
			age_code,
			minimum_years,
			capture_time,
			record_type,
			sex,
			weight,
			wing_length,
			bird:Birds (
				ring_no,
				species:Species (
					id,
					species_name
				)
			)
		)
	`
		)
		.eq('visit_date', date)
		.then(catchSupabaseErrors)) as {
		id: number;
		encounters: SessionEncounter[];
	}[];
	if (data.length === 0) {
		return null;
	}
	if (data.length > 1) {
		throw new Error(`Multiple sessions per date not implemented yet`);
	}
	return data[0].encounters;
}

function groupBySpecies(
	encounters: SessionEncounter[]
): SpeciesWithEncounters[] {
	const map: Record<string, SessionEncounter[]> = {};
	encounters.forEach((encounter) => {
		const species = encounter.bird.species.species_name;
		map[species] = map[species] || [];
		map[species].push(encounter);
	});
	return Object.entries(map)
		.map(([species, encounters]) => ({ species, encounters }))
		.sort((a, b) => {
			if (a.encounters.length === b.encounters.length) {
				return a.species.localeCompare(b.species);
			}
			return a.encounters.length < b.encounters.length ? 1 : -1;
		});
}

function SessionSummary({
	data: session,
	params: { date }
}: {
	data: SessionEncounter[];
	params: { date: string };
}) {
	const speciesList = groupBySpecies(session);

	return (
		<PageWrapper>
			<PrimaryHeading>
				{formatDate(new Date(date), 'EEE do MMMM yyyy')}
			</PrimaryHeading>
			<BadgeList
				testId="session-stats"
				items={[
					`${session.length} birds`,
					`${speciesList.length} species`,
					`${session.filter((encounter) => encounter.record_type === 'N').length} new`,
					`${session.filter((encounter) => encounter.record_type === 'S').length} retraps`,
					`${session.filter((encounter) => encounter.minimum_years >= 1).length} adults`,
					`${session.filter((encounter) => encounter.minimum_years === 0).length} juvs`
				]}
			/>
			<SessionTable speciesList={speciesList} />
		</PageWrapper>
	);
}

export default async function SessionPage(props: PageProps) {
	return (
		<BootstrapPageData<SessionEncounter[], PageProps, PageParams>
			pageProps={props}
			getCacheKeys={(params) => ['session', params.date as string]}
			dataFetcher={fetchSessionData}
			PageComponent={SessionSummary}
			ttl={3600 * 24 * 7} // 1 week because once a session is complete the data does not change
		/>
	);
}
