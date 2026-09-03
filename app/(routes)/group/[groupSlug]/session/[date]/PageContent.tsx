import {
	SessionTabs,
	type SpeciesWithEncounters
} from '@/app/components/pages/session/SingleSessionData';
import type { SessionEncounter } from '@/app/models/session';
import type { LocationRow } from '@/app/models/db';
import {
	PageWrapper,
	PrimaryHeading,
	printLocationName
} from '@/app/components/shared/DesignSystem';
import Link from 'next/link';
import { format as formatDate } from 'date-fns';
import { Fragment } from 'react';
import { calculateSessionChronology } from '@/app/models/session-chronology';
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

export function buildSessionSummarySentence(
	encounters: SessionEncounter[],
	speciesCount: number
): string {
	const birdCount = encounters.length;
	const newCount = encounters.filter(
		(encounter) => encounter.record_type === 'N'
	).length;
	const retrapCount = encounters.filter(
		(encounter) => encounter.record_type === 'S'
	).length;

	const birdWord = birdCount === 1 ? 'bird' : 'birds';
	const retrapWord = retrapCount === 1 ? 'retrap' : 'retraps';

	return `${birdCount} ${birdWord} of ${speciesCount} species, ${newCount} new and ${retrapCount} ${retrapWord}`;
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
	return locations.length > 1 ? (
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
	) : null;
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
		<nav aria-label="Session navigation" className="flex gap-2 text-sm -mb-1">
			{previousSessionDate ? (
				<Link
					href={`/group/${viewedGroup.slug}/session/${previousSessionDate}`}
					aria-label="Previous session"
				>
					← Previous
				</Link>
			) : null}
			{nextSessionDate ? (
				<Link
					href={`/group/${viewedGroup.slug}/session/${nextSessionDate}`}
					aria-label="Next session"
				>
					Next →
				</Link>
			) : null}
		</nav>
	);
}

export function SessionPageContent({
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
			<SessionNavigation
				adjacentSessionDates={dayData.adjacentSessionDates}
				viewedGroup={viewedGroup}
			/>
			<PrimaryHeading>
				{formatDate(new Date(date), 'EEE do MMMM yyyy')}
			</PrimaryHeading>

			<p className="text-lg" data-testid="session-stats">
				{buildSessionSummarySentence(dayData.encounters, speciesList.length)}
			</p>
			<Locations
				locations={dayData.locations}
				date={date}
				selectedLocation={locationId}
				viewedGroup={viewedGroup}
			/>

			<SessionTabs
				speciesList={speciesList}
				netRounds={chronology.netRounds}
				locationId={locationId}
				date={date}
				viewedGroupId={viewedGroup.id}
				oldestEncounter={oldestEncounter}
			/>
		</PageWrapper>
	);
}
