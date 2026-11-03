import type { TableQueryDefinition } from '../types';

/**
 * One species' all-time row, filtered by name through an `!inner` `Species`
 * join — powers the species detail page's headline stats (#1222/#1244 —
 * this used to come from a live `core_stats` RPC call). The `!inner` join is
 * what distinguishes this from `simpleStatsCacheBySpeciesByQuery`'s plain
 * (non-filtering) embed.
 */
export const simpleStatsCacheBySpeciesHeadlineQuery: TableQueryDefinition = {
	table: 'SimpleStatsCacheBySpecies',
	name: 'headline',
	select: '*, Species!inner(species_name)',
	fixturePaths: ['tables/SimpleStatsCacheBySpecies/robin-alpha.headline.json']
};
