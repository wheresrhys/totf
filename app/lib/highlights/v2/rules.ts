import type { HighlightsGenerator } from './types';
import { birdCount } from './counts/bird-count';
import { encounterCount } from './counts/encounter-count';
import { speciesCount } from './counts/species-count';
import { newBirds } from './counts/new-birds';
import { youngBirds } from './counts/young-birds';
import { singleSpeciesCount } from './counts/single-species-count';
import { singleSpeciesEncounters } from './counts/single-species-encounters';
import { eachSpeciesCount } from './counts/each-species-count';
import { eachSpeciesYoung } from './counts/each-species-young';

export const highlightRules: HighlightsGenerator[] = [
	birdCount,
	encounterCount,
	speciesCount,
	newBirds,
	youngBirds,
	singleSpeciesCount,
	singleSpeciesEncounters,
	eachSpeciesCount,
	eachSpeciesYoung
];
