import type { BirdRow, EncounterRow, SessionRow, SpeciesRow } from './db';

export type EncounterOfBird = EncounterRow & {
	session: SessionRow;
};

export type BirdOfSpecies = BirdRow & {
	encounters: EncounterOfBird[];
};

export type StandaloneBird = BirdOfSpecies & {
	species: SpeciesRow;
};

type Sex = 'M' | 'F' | 'U';

type EncountersInterface = { encounters: readonly EncounterOfBird[] };

type BasicBird = BirdRow & EncountersInterface;

export type EnrichedBirdWithEncounters<BirdType extends BasicBird> =
	BirdType & {
		provenAge: number;
		sex: Sex;
		sexCertainty: number;
		firstEncounterDate: Date;
		lastEncounterDate: Date;
		lastEncounter: BirdType['encounters'][number];
	};

export type EnrichedBirdOfSpecies = EnrichedBirdWithEncounters<BirdOfSpecies>;
export type EnrichedStandaloneBird = EnrichedBirdWithEncounters<StandaloneBird>;

export function orderBirdsByRecency<BirdType extends BasicBird>(
	birds: BirdType[],
	{
		direction,
		type,
		encountersAlreadySorted = false
	}: {
		direction: 'asc' | 'desc';
		type: 'first' | 'last';
		encountersAlreadySorted?: boolean;
	}
): BirdType[] {
	return birds.sort((a, b) => {
		const aEncs = encountersAlreadySorted
			? a.encounters
			: orderEncountersByRecency(a.encounters as EncounterOfBird[], 'asc');
		const bEncs = encountersAlreadySorted
			? b.encounters
			: orderEncountersByRecency(b.encounters as EncounterOfBird[], 'asc');
		// note that to avoid confusion, encounters are always sorted from first to last, so that the most recent encounter is the last one
		return pairwiseSortEncounters(direction)(
			aEncs[type === 'first' ? 0 : aEncs.length - 1],
			bEncs[type === 'first' ? 0 : bEncs.length - 1]
		);
	}) as BirdType[];
}

export function pairwiseSortEncounters(
	direction: 'asc' | 'desc'
): (a: EncounterOfBird, b: EncounterOfBird) => -1 | 0 | 1 {
	return (a, b) => {
		const aTime = new Date(a.session.visit_date).getTime();
		const bTime = new Date(b.session.visit_date).getTime();
		if (aTime === bTime) return 0;
		if (direction === 'asc') return aTime > bTime ? 1 : -1;
		else return aTime < bTime ? 1 : -1;
	};
}

export function orderEncountersByRecency(
	encounters: EncounterOfBird[],
	direction: 'asc' | 'desc'
) {
	return encounters.sort(pairwiseSortEncounters(direction));
}

function getSex(encounters: EncounterOfBird[]): [Sex, number] {
	const counts = encounters.reduce(
		(tallies, encounter) => {
			tallies[encounter.sex]++;
			return tallies;
		},
		{ M: 0, F: 0, U: 0 } as Record<string, number>
	);
	if (counts['U'] === encounters.length) {
		return ['U', 1];
	}
	if (counts['M'] === counts['F']) {
		return ['U', 0.5];
	}
	if (counts['M'] > counts['F']) {
		return ['M', counts['M'] / encounters.length];
	} else {
		return ['F', counts['F'] / encounters.length];
	}
}

function getProvenAge(
	encounters: EncounterOfBird[],
	lastEncounterDate: Date,
	isOrdered: boolean = false
): number {
	if (encounters[0].max_hatch_year) {
		return (
			lastEncounterDate.getFullYear() -
			Math.min(...encounters.map((encounter) => encounter.max_hatch_year))
		);
	}

	if (!isOrdered) {
		encounters = orderEncountersByRecency(encounters, 'asc');
	}

	// legacy calculation - clean up once minimum years is gone from the database
	return (
		encounters[0].minimum_years +
		new Date(
			encounters[encounters.length - 1].session.visit_date
		).getFullYear() -
		new Date(encounters[0].session.visit_date).getFullYear()
	);
}

export function enrichBird<BirdType extends BasicBird>(
	bird: BirdType
): EnrichedBirdWithEncounters<BirdType> {
	const orderedEncounters = orderEncountersByRecency(
		bird.encounters as EncounterOfBird[],
		'asc'
	);
	const [sex, sexCertainty] = getSex(orderedEncounters);
	const lastEncounterDate = new Date(
		orderedEncounters[orderedEncounters.length - 1].session.visit_date
	);
	return {
		...bird,
		encounters: orderedEncounters,
		sex,
		sexCertainty,
		firstEncounterDate: new Date(orderedEncounters[0].session.visit_date),
		lastEncounterDate,
		lastEncounter: orderedEncounters[orderedEncounters.length - 1],
		provenAge: getProvenAge(orderedEncounters, lastEncounterDate, true)
	};
}
