import type { HighlightsGenerator } from './types';
import { birdCount } from './counts/bird-count';
import { encounterCount } from './counts/encounter-count';
import { speciesCount } from './counts/species-count';
import { newBirds } from './counts/new-birds';
import { juvs } from './counts/juvs';
import { singleSpeciesCount } from './counts/single-species-count';
import { singleSpeciesEncounters } from './counts/single-species-encounters';
import { eachSpeciesCount } from './counts/each-species-count';
import { eachSpeciesJuvs } from './counts/each-species-juvs';

export const highlightRules: HighlightsGenerator[] = [
	birdCount,
	encounterCount,
	speciesCount,
	newBirds,
	juvs,
	singleSpeciesCount,
	singleSpeciesEncounters,
	eachSpeciesCount,
	eachSpeciesJuvs
];
