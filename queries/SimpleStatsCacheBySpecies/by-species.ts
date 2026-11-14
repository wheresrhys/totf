import type { TableQueryDefinition } from '../types';

/**
 * The all-time cell, one row per species, with the embedded species name
 * resolved via a non-inner `Species` join — powers `fetchSpeciesData`'s
 * (`app/actions/spp-data.ts`) cache-aligned windows, i.e. every window the
 * summary pages' Species tab asks for (#1244 — this used to come from a
 * live `core_stats` RPC call). Captured for Alpha, Beta and Gamma.
 */
export const simpleStatsCacheBySpeciesByQuery: TableQueryDefinition = {
	table: 'SimpleStatsCacheBySpecies',
	name: 'by-species',
	select: '*, Species(species_name)',
	fixturePaths: [
		'tables/SimpleStatsCacheBySpecies/alpha.by-species.json',
		'tables/SimpleStatsCacheBySpecies/beta.by-species.json',
		'tables/SimpleStatsCacheBySpecies/gamma.by-species.json'
	]
};
