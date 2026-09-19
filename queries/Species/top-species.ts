import type { TableQueryDefinition } from '../types';

/**
 * Species with their bird count, unfiltered/unsliced — powers `fetchTopSpecies`
 * (`app/(routes)/page.tsx`), which filters to birds count > 0, sorts
 * descending and slices to the top 10 client-side.
 */
export const topSpeciesQuery: TableQueryDefinition = {
	table: 'Species',
	name: 'top-species',
	select: 'id, species_name, birds:Birds(count)',
	fixturePaths: ['tables/Species/alpha.top-species.json']
};
