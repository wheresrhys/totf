import {
	SessionTable,
	type SpeciesWithEncounters
} from '@/app/components/SingleSessionTable';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { SessionEncounter } from '@/app/models/session';
import type { LocationRow, SessionRow } from '@/app/models/db';
import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import {
	BadgeList,
	PageWrapper,
	PrimaryHeading,
	printLocationName
} from '@/app/components/shared/DesignSystem';
import Link from 'next/link';
import { format as formatDate } from 'date-fns';
import { Fragment } from 'react';

type PageParams = {
	groupId: number;
	date: string;
	locationId: number | undefined;
};
type PageProps = {
	params: Promise<{
		params:
			| ['group', string, string]
			| ['group', string, string, 'site', string];
	}>;
};

type DayData = {
	encounters: SessionEncounter[];
	locations: LocationRow[];
};

async function getPageParams(pageProps: PageProps): Promise<PageParams> {
	const pageParams = await pageProps.params;
	return {
		groupId: Number(pageParams.params[1]),
		date: pageParams.params[2],
		locationId: pageParams.params[4] ? Number(pageParams.params[4]) : undefined
	};
}

async function fetchSessionData(
	{ groupId: paramGroupId, date, locationId }: PageParams
	// groupId: number
): Promise<DayData | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	let sessions = (await supabase
		.from('Sessions')
		.select(
			'id, location_id, location:Locations (id, location_name, ringing_group_id)'
		)
		.eq('visit_date', date)
		// use paramGroupId to fetch the data as in cases where one group
		// shareds a link with a member of another group, we want the page to
		// still attempt to fetch their data
		// (will do something about granting permission across groups later)
		.eq('ringing_group_id', paramGroupId)
		.then(catchSupabaseErrors)) as (SessionRow & { location: LocationRow })[];

	if (!sessions || sessions.length === 0) {
		return { encounters: [], locations: [] };
	}

	if (locationId) {
		sessions = sessions.filter((item) => item.location_id === locationId);
		if (sessions.length === 0) {
			return { encounters: [], locations: [] };
		}
	}

	const encounters = (await supabase
		.from('Encounters')
		.select(
			`
			id,
			session_id,
			age_code,
			capture_time,
			record_type,
			ringing_group_id,
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
	`
		)
		.in(
			'session_id',
			sessions.map((session) => session.id)
		)
		.eq('ringing_group_id', paramGroupId)
		.then(catchSupabaseErrors)) as SessionEncounter[];

	return {
		encounters,
		locations: sessions.map((item) => item.location)
	};
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

function Locations({
	locations,
	date,
	selectedLocation,
	groupId
}: {
	locations: LocationRow[];
	date: string;
	selectedLocation: number | undefined;
	groupId: number;
}) {
	return (
		<small className="text-sm text-gray-500">
			{locations.length === 1
				? printLocationName(locations[0].location_name)
				: locations.map((location, index) => (
						<Fragment key={location.id}>
							{index > 0 ? ', ' : ''}
							{selectedLocation && selectedLocation === location.id ? (
								printLocationName(location.location_name)
							) : (
								<Link
									className="link"
									href={`/session/group/${groupId}/${date}/site/${location.id}`}
								>
									{printLocationName(location.location_name)}
								</Link>
							)}
						</Fragment>
					))}
			{selectedLocation && locations.length > 1 ? (
				<>
					,{' '}
					<Link className="link" href={`/session/group/${groupId}/${date}`}>
						View all
					</Link>
				</>
			) : null}
		</small>
	);
}

function SessionSummary({
	data: dayData,
	params: { date, locationId, groupId }
}: {
	data: DayData;
	params: { date: string; locationId: number | undefined; groupId: number };
}) {
	const speciesList = groupBySpecies(dayData.encounters);

	if (dayData.locations.length === 0) {
		return (
			<PageWrapper>
				<p>
					No session found: either no session occurred on this date{' '}
					{locationId ? 'at this location ' : ''}, or you are not authorised to
					view it
				</p>
			</PageWrapper>
		);
	}
	return (
		<PageWrapper>
			<PrimaryHeading>
				{formatDate(new Date(date), 'EEE do MMMM yyyy')}
				<br />
				<Locations
					locations={dayData.locations}
					date={date}
					selectedLocation={locationId}
					groupId={groupId}
				/>
			</PrimaryHeading>
			<BadgeList
				testId="session-stats"
				items={[
					`${dayData.encounters.length} birds`,
					`${speciesList.length} species`,
					`${dayData.encounters.filter((encounter) => encounter.record_type === 'N').length} new`,
					`${dayData.encounters.filter((encounter) => encounter.record_type === 'S').length} retraps`,
					`${dayData.encounters.filter((encounter) => encounter.age_code > 3).length} adults`,
					`${dayData.encounters.filter((encounter) => [1, 3].includes(encounter.age_code)).length} juvs`,
					`${dayData.encounters.filter((encounter) => encounter.age_code === 2).length} unknown age`
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
			getCacheKeys={(params) =>
				params.locationId
					? ['session', params.date as string, `loc-${params.locationId}`]
					: ['session', params.date as string]
			}
			dataFetcher={fetchSessionData}
			PageComponent={SessionSummary}
			getParams={getPageParams}
			ttl={3600 * 24 * 7} // 1 week because once a session is complete the data does not change
		/>
	);
}
