import type { TableQueryDefinition } from '../types';

/**
 * Species with their bird count, unfiltered/unsliced — powers `fetchGroupSpecies`
 * (`app/(routes)/page.tsx`), which filters to birds count > 0 for the home
 * page's species-by-letter nav (#1025). Query name/fixture kept as
 * `top-species` since the underlying query itself is unchanged.
 */
export const topSpeciesQuery: TableQueryDefinition = {
	table: 'Species',
	name: 'top-species',
	select: 'id, species_name, birds:Birds(count)',
	fixturePaths: ['tables/Species/alpha.top-species.json']
};
