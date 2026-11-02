import type { HighlightsGenerator } from '../types';
import { birdCount } from '../rules/bird-count';
import { encounterCount } from '../rules/encounter-count';
import { speciesCount } from '../rules/species-count';
import { newBirds } from '../rules/new-birds';
import { juvs } from '../rules/juvs';
import { singleSpeciesCount } from '../rules/single-species-count';
import { singleSpeciesEncounters } from '../rules/single-species-encounters';
import { eachSpeciesCount } from '../rules/each-species-count';
import { eachSpeciesJuvs } from '../rules/each-species-juvs';
import { rarities } from '../rules/rarities';
import { heaviestOfSpecies } from '../rules/heaviest-of-species';
import { lightestOfSpecies } from '../rules/lightest-of-species';

export const highlightRules: HighlightsGenerator[] = [
	birdCount,
	encounterCount,
	speciesCount,
	newBirds,
	juvs,
	singleSpeciesCount,
	singleSpeciesEncounters,
	eachSpeciesCount,
	eachSpeciesJuvs,
	rarities,
	heaviestOfSpecies,
	lightestOfSpecies
];

const rulesMap: Record<string, HighlightsGenerator> = {};

highlightRules.forEach((rule) => {
	rulesMap[rule.descriptor.type] = rule;
});

export const ruleTypes = highlightRules.map((rule) => rule.descriptor.type);

export function getRule(ruleName: string): HighlightsGenerator {
	const rule = rulesMap[ruleName];
	if (!rule) {
		throw new Error('bad rule name');
	}
	return rule;
}
