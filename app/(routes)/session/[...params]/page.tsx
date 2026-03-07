import {
	SessionTable,
	type SpeciesWithEncounters
} from '@/app/components/SingleSessionTable';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import type { SessionEncounter } from '@/app/models/session';
import type { LocationRow } from '@/app/models/db';
import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import {
	BadgeList,
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import Link from 'next/link';
import { format as formatDate } from 'date-fns';
import { Fragment } from 'react';

type PageParams = { date: string, location: number | undefined };
type PageProps = { params: Promise<[string, string | undefined]> };

type DayData = {
	encounters: SessionEncounter[];
	locations: LocationRow[];
};

type SessionLocation = {
	id: number;
	location_id: number;
	location: LocationRow;
	encounters: SessionEncounter[];
}

async function getPageParams (pageProps: PageProps): Promise<PageParams> {
	const pageParams = await pageProps.params;
	return {
		date: pageParams.params[0],
		location: pageParams.params[1] ? Number(pageParams.params[1].substring(4)) : undefined
	}
}

async function fetchSessionData({ date, location }: PageParams): Promise<DayData | null> {

	const data = (await supabase
		.from('Sessions')
		.select(
			`
		id,
		location_id,
		location:Locations (
			id,
			location_name
		),
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
		.then(catchSupabaseErrors)) as SessionLocation[];
	if (data.length === 0) {
		return null;
	}
	if (data.length === 1) {
		return {
			encounters: data[0].encounters,
			locations: [data[0].location]
		};
	}
	if (location) {
		const sessionData = data.find((item) => item.location_id === location);
		if (!sessionData) {
			return null;
		}
		return {
			encounters: sessionData.encounters,
			locations: data.map((item) => item.location)
		};
	} else {
		return {
			encounters: data.flatMap((item) => item.encounters),
			locations: data.map((item) => item.location)
		};
	}

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

function printName(locationName: string) {
	const match = /\(([^)]+)\)/g.exec(locationName);
	console.log(match);
	if (match) {
		return match[1];
	}
	return locationName;
}

function Locations({
	locations,
	date,
	selectedLocation
}: {
	locations: LocationRow[];
	date: string;
	location: number | undefined;
}) {
	return (
		<small className="text-sm text-gray-500">
			{locations.length === 1
				? printName(locations[0].location_name)
				: locations.map((location, index) => (
						<Fragment key={location.id}>
							{index > 0 ? ', ' : ''}
							{selectedLocation && selectedLocation === location.id ? printName(location.location_name) : <Link
								className="link"
								href={`/session/${date}/loc-${location.id}`}
							>
								{printName(location.location_name)}
							</Link>}

						</Fragment>
				))}{selectedLocation ? <>, <Link className="link" href={`/session/${date}`}>View all</Link></> : null}
		</small>
	);
}

function SessionSummary({
	data: dayData,
	params: { date, location }
}: {
	data: DayData;
	params: { date: string, location: number | undefined };
}) {
	const speciesList = groupBySpecies(dayData.encounters);

	return (
		<PageWrapper>
			<PrimaryHeading>
				{formatDate(new Date(date), 'EEE do MMMM yyyy')}
				<br />
				<Locations locations={dayData.locations} date={date} selectedLocation={location} />
			</PrimaryHeading>
			<BadgeList
				testId="session-stats"
				items={[
					`${dayData.encounters.length} birds`,
					`${speciesList.length} species`,
					`${dayData.encounters.filter((encounter) => encounter.record_type === 'N').length} new`,
					`${dayData.encounters.filter((encounter) => encounter.record_type === 'S').length} retraps`,
					`${dayData.encounters.filter((encounter) => encounter.minimum_years >= 1).length} adults`,
					`${dayData.encounters.filter((encounter) => encounter.minimum_years === 0).length} juvs`
				]}
			/>
			<SessionTable speciesList={speciesList} />
		</PageWrapper>
	);
}

export default async function SessionPage(props: PageProps) {
	return (
		<BootstrapPageData<DayData, PageProps, PageParams>
			pageProps={props}
			getCacheKeys={(params) => ['session', params.date as string]}
			dataFetcher={fetchSessionData}
			PageComponent={SessionSummary}
			getParams={getPageParams}
			ttl={3600 * 24 * 7} // 1 week because once a session is complete the data does not change
		/>
	);
}
