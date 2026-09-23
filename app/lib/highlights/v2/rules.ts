import type { HighlightsGenerator } from './types';
import { birdCount } from './counts/bird-count';
import { encounterCount } from './counts/encounter-count';
import { speciesCount } from './counts/species-count';
import { spec } from 'node:test/reporters';

export const highlightRules: HighlightsGenerator[] = [
	birdCount,
	encounterCount,
	speciesCount
];
