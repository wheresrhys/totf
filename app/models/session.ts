import type { EncounterRow, BirdRow, SpeciesRow, SessionRow } from './db';

export type SessionEncounter = EncounterRow & {
	bird: BirdRow & {
		species: SpeciesRow;
	};
};

export type SessionWithEncountersCount = SessionRow & {
	encounters: { count: number }[];
};
