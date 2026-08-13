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

export type ResightingEncounter = EncounterRow & {
	bird: BirdRow & {
		species: SpeciesRow;
	};
	session: SessionRow & {
		location: LocationRow;
	};
};

export type PulliEncounter = EncounterRow & {
	bird: BirdRow & {
		species: SpeciesRow;
	};
	session: SessionRow & {
		location: LocationRow;
	};
};

export type SessionWithEncountersCount = SessionRow & {
	encounters: { count: number }[];
	location: LocationRow;
};
