import {
	SessionTabs,
	type SpeciesWithEncounters
} from '@/app/components/SingleSessionData';
import { getAuthenticatedSupabaseClient } from '@/lib/group-auth';
import { catchSupabaseErrors } from '@/lib/supabase';
import type { SessionEncounter } from '@/app/models/session';
import type { LocationRow, SessionRow } from '@/app/models/db';
import { getAgeClass } from '@/app/models/encounter';
import {
	BadgeList,
	PageWrapper,
	PrimaryHeading,
	printLocationName
} from '@/app/components/shared/DesignSystem';
import Link from 'next/link';
import { format as formatDate } from 'date-fns';
import { Fragment } from 'react';
import { calculateSessionChronology } from '@/app/models/session-chronology';
import { formatMinutesForDisplay } from '@/lib/postgres-interval';
import type { ViewedGroup } from '@/lib/group-slug';

export type PageParams = {
	viewedGroupId: number;
	date: string;
	locationId: number | undefined;
};

export type AdjacentSessionDates = {
	previousSessionDate: string | null;
	nextSessionDate: string | null;
};

export type DayData = {
	encounters: SessionEncounter[];
	locations: LocationRow[];
	adjacentSessionDates: AdjacentSessionDates;
};

async function fetchAdjacentSessionDates(
	supabase: Awaited<ReturnType<typeof getAuthenticatedSupabaseClient>>,
	viewedGroupId: number,
	date: string
): Promise<AdjacentSessionDates> {
	const [previousResult, nextResult] = await Promise.all([
		supabase
			.from('Sessions')
			.select('visit_date')
			.eq('ringing_group_id', viewedGroupId)
			.eq('session_type', 'FULL_GROWN')
			.lt('visit_date', date)
			.order('visit_date', { ascending: false })
			.limit(1)
			.then(catchSupabaseErrors) as Promise<{ visit_date: string }[]>,
		supabase
			.from('Sessions')
			.select('visit_date')
			.eq('ringing_group_id', viewedGroupId)
			.eq('session_type', 'FULL_GROWN')
			.gt('visit_date', date)
			.order('visit_date', { ascending: true })
			.limit(1)
			.then(catchSupabaseErrors) as Promise<{ visit_date: string }[]>
	]);
	return {
		previousSessionDate: previousResult?.[0]?.visit_date ?? null,
		nextSessionDate: nextResult?.[0]?.visit_date ?? null
	};
}

export async function fetchSessionData({
	viewedGroupId,
	date,
	locationId
}: PageParams): Promise<DayData | null> {
	const supabase = await getAuthenticatedSupabaseClient();
	let sessions = (await supabase
		.from('Sessions')
		.select(
			'id, location_id, location:Locations (id, location_name, ringing_group_id)'
		)
		.eq('visit_date', date)
		.eq('ringing_group_id', viewedGroupId)
		.eq('session_type', 'FULL_GROWN')
		.then(catchSupabaseErrors)) as (SessionRow & { location: LocationRow })[];

	if (!sessions || sessions.length === 0) {
		return {
			encounters: [],
			locations: [],
			adjacentSessionDates: await fetchAdjacentSessionDates(
				supabase,
				viewedGroupId,
				date
			)
		};
	}
	const locations = sessions.map((item) => item.location);
	const adjacentSessionDates = await fetchAdjacentSessionDates(
		supabase,
		viewedGroupId,
		date
	);
	if (locationId) {
		sessions = sessions.filter((item) => item.location_id === locationId);
		if (sessions.length === 0) {
			return { encounters: [], locations: [], adjacentSessionDates };
		}
	}

	const encounters = (await supabase
		.from('Encounters')
		.select(
			`
			id,
			session_id,
			age_code,
			is_juv,
			breeding_condition,
			capture_time,
			moult_code,
			record_type,
			ringing_group_id,
			sex,
			sexing_method,
			weight,
			wing_length,
			bird:Birds (
				ring_no,
				proven_age,
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
		.eq('ringing_group_id', viewedGroupId)
		.then(catchSupabaseErrors)) as SessionEncounter[];

	return {
		encounters,
		locations,
		adjacentSessionDates
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

function findOldestEncounter(
	encounters: SessionEncounter[]
): SessionEncounter | null {
	return encounters.reduce<SessionEncounter | null>((oldest, encounter) => {
		if (!oldest || encounter.bird.proven_age > oldest.bird.proven_age) {
			return encounter;
		}
		return oldest;
	}, null);
}

function Locations({
	locations,
	date,
	selectedLocation,
	viewedGroup
}: {
	locations: LocationRow[];
	date: string;
	selectedLocation: number | undefined;
	viewedGroup: ViewedGroup;
}) {
	return (
		<small className="text-sm text-gray-500 flex flex-wrap gap-2 mt-2">
			{locations.length === 1
				? printLocationName(locations[0].location_name)
				: locations.map((location) => (
						<Fragment key={location.id}>
							{selectedLocation && selectedLocation === location.id ? (
								<span className="badge badge-secondary">
									{printLocationName(location.location_name)}
								</span>
							) : (
								<Link
									className="link badge badge-outline"
									href={`/group/${viewedGroup.slug}/session/${date}/site/${location.id}`}
								>
									{printLocationName(location.location_name)}
								</Link>
							)}
						</Fragment>
					))}
			{selectedLocation && locations.length > 1 ? (
				<>
					<Link
						className="link badge badge-outline"
						href={`/group/${viewedGroup.slug}/session/${date}`}
					>
						View all
					</Link>
				</>
			) : null}
		</small>
	);
}

function SessionNavigation({
	adjacentSessionDates,
	viewedGroup
}: {
	adjacentSessionDates: AdjacentSessionDates;
	viewedGroup: ViewedGroup;
}) {
	const { previousSessionDate, nextSessionDate } = adjacentSessionDates;
	if (!previousSessionDate && !nextSessionDate) return null;
	return (
		<nav aria-label="Session navigation" className="flex gap-2 text-sm mb-2">
			{previousSessionDate ? (
				<Link
					href={`/group/${viewedGroup.slug}/session/${previousSessionDate}`}
					aria-label="Previous session"
					className="link"
				>
					← Previous
				</Link>
			) : null}
			{nextSessionDate ? (
				<Link
					href={`/group/${viewedGroup.slug}/session/${nextSessionDate}`}
					aria-label="Next session"
					className="link"
				>
					Next →
				</Link>
			) : null}
		</nav>
	);
}

export function SessionSummary({
	data: dayData,
	params: { date, locationId },
	viewedGroup
}: {
	data: DayData;
	params: {
		date: string;
		locationId: number | undefined;
	};
	viewedGroup: ViewedGroup;
}) {
	const speciesList = groupBySpecies(dayData.encounters);
	const chronology = calculateSessionChronology(dayData.encounters);
	const oldestEncounter = findOldestEncounter(dayData.encounters);

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
					viewedGroup={viewedGroup}
				/>
			</PrimaryHeading>
			<SessionNavigation
				adjacentSessionDates={dayData.adjacentSessionDates}
				viewedGroup={viewedGroup}
			/>
			<BadgeList
				testId="session-stats"
				items={
					[
						`${dayData.encounters.length} birds`,
						`${speciesList.length} species`,
						`${dayData.encounters.filter((encounter) => encounter.record_type === 'N').length} new`,
						`${dayData.encounters.filter((encounter) => encounter.record_type === 'S').length} retraps`,
						`${dayData.encounters.filter((encounter) => getAgeClass(encounter) === 'adult').length} adults`,
						`${dayData.encounters.filter((encounter) => getAgeClass(encounter) === 'pullus').length} pullus`,
						`${dayData.encounters.filter((encounter) => getAgeClass(encounter) === 'juv').length} juvs`,
						`${dayData.encounters.filter((encounter) => getAgeClass(encounter) === 'postjuv').length} postjuv`,
						`${dayData.encounters.filter((encounter) => encounter.age_code === 2).length} unknown age`,
						`${
							dayData.encounters.filter(
								(encounter) =>
									encounter.record_type === 'N' &&
									(encounter.age_code === 1 || encounter.age_code === 3)
							).length
						} New young`,
						`Start: ${chronology.startTime ? chronology.startTime.slice(0, 5) : '–'}`,
						`End: ${chronology.endTime ? chronology.endTime.slice(0, 5) : '–'}`,
						`Duration: ${chronology.durationMinutes !== null ? formatMinutesForDisplay(chronology.durationMinutes) : '–'}`,
						`Net rounds: ${chronology.netRounds.length}`,
						oldestEncounter && oldestEncounter.bird.proven_age > 0
							? `Oldest: ${oldestEncounter.bird.proven_age} years — ${oldestEncounter.bird.species.species_name} (${oldestEncounter.bird.ring_no})`
							: null
					].filter(Boolean) as string[]
				}
			/>

			<SessionTabs
				speciesList={speciesList}
				netRounds={chronology.netRounds}
				locationId={locationId}
				date={date}
				viewedGroupId={viewedGroup.id}
			/>
		</PageWrapper>
	);
}
