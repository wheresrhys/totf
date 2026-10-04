import type {
	EncounterRow,
	BirdRow,
	SpeciesRow,
	SessionRow,
	LocationRow
} from './db';

export type SessionEncounter = EncounterRow & {
	bird: BirdRow & {
		species: SpeciesRow;
	};
};

/** A day's encounters grouped under the species they belong to. */
export type SpeciesWithEncounters = {
	species: string;
	encounters: SessionEncounter[];
};

export type ResightingEncounter = EncounterRow & {
	bird: BirdRow & {
		species: SpeciesRow;
	};
	location: LocationRow;
};

export type PulliEncounter = EncounterRow & {
	bird: BirdRow & {
		species: SpeciesRow;
	};
	location: LocationRow;
};

export type SessionWithEncountersCount = SessionRow & {
	encounters: { count: number }[];
};
