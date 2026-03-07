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

export type SessionWithEncountersCount = SessionRow & {
	encounters: { count: number }[];
	location: LocationRow;
};
