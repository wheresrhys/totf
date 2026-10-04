import { SessionTabs } from '@/app/components/pages/session/SessionTabs';
import type { SessionTabParams } from '@/app/components/pages/session/session-tab-config';
import type {
	SessionEncounter,
	SpeciesWithEncounters
} from '@/app/models/session';
import type { LocationRow } from '@/app/models/db';
import {
	PageWrapper,
	PrimaryHeading,
	printLocationName,
	Standfirst
} from '@/app/components/shared/DesignSystem';
import Link from 'next/link';
import { format as formatDate } from 'date-fns';
import { calculateSessionChronology } from '@/app/lib/session-chronology';
import { isMistNetEncounter } from '@/app/models/encounter';
import type { ViewedGroup } from '@/app/lib/group-slug';

export type PageParams = {
	viewedGroupId: number;
	date: string;
	// The optional `?tabId=` search param (#803, applied here by #805) — never
	// affects `getCacheKeys`, only which tab `SessionTabs` focuses/loads first.
	tabId?: string;
	// The deep-linked tab's data, already fetched server-side by `page.tsx`'s
	// `prefetchActiveTabData` call (#1059), so the tab renders with its content
	// in hand instead of flashing a spinner and refetching on hydration.
	// `undefined` whenever there was nothing to prefetch.
	prefetchedTabData?: { tabId: string; data: unknown };
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

/**
 * Display-only strip naming the locations the day's birds were caught at. There
 * is no location-scoped session view any more (#1020) — this is information,
 * not navigation, so nothing here is a link or a filter control.
 */
function Locations({ locations }: { locations: LocationRow[] }) {
	if (locations.length === 0) return null;
	return (
		<small
			className="text-sm text-gray-500 flex flex-wrap gap-2 mt-2"
			data-testid="session-locations"
		>
			{locations.map((location) => (
				<span key={location.id} className="badge badge-outline">
					{printLocationName(location.location_name)}
				</span>
			))}
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
	params: { date, tabId, prefetchedTabData },
	viewedGroup
}: {
	data: DayData;
	params: Omit<PageParams, 'viewedGroupId'>;
	viewedGroup: ViewedGroup;
}) {
	const speciesList = groupBySpecies(dayData.encounters);
	// Mist-netting vs Other catches (#1022): anything else non-resighting
	// (already excluded by this page's own fetch, see
	// RESIGHTING_RECORD_TYPES_FILTER_LIST in page.tsx) that isn't mist-netted
	// — see isMistNetEncounter — counts as an "other catch": hand-caught, box
	// trap, etc.
	const mistNetSpeciesList = groupBySpecies(
		dayData.encounters.filter(isMistNetEncounter)
	);
	const otherCatchesSpeciesList = groupBySpecies(
		dayData.encounters.filter((encounter) => !isMistNetEncounter(encounter))
	);
	const chronology = calculateSessionChronology(dayData.encounters);
	const oldestEncounter = findOldestEncounter(dayData.encounters);
	const sessionTabParams: SessionTabParams = {
		date,
		mistNetSpeciesList,
		otherCatchesSpeciesList,
		netRounds: chronology.netRounds,
		oldestEncounter
	};

	if (dayData.encounters.length === 0) {
		return (
			<PageWrapper>
				<p>
					No session found: either no session occurred on this date, or you are
					not authorised to view it
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

			<Standfirst testId="session-stats">
				{buildSessionSummarySentence(dayData.encounters, speciesList.length)}
			</Standfirst>
			<Locations locations={dayData.locations} />

			<SessionTabs
				params={sessionTabParams}
				viewedGroup={viewedGroup}
				initialTabId={tabId}
				initialTabData={prefetchedTabData}
			/>
		</PageWrapper>
	);
}
