import type { StatsPerDayAndSpeciesResult } from '@/app/models/db';

// juvRow — a row builder that sets juv_count (and, by default, an equal
// encounter_count) rather than only encounter_count like the shared
// speciesRow/dayRows fixtures. Shared by deriveSessionTotalJuvRecords and
// deriveSpeciesJuvRecords tests.
export function juvRow(
	date: string,
	species: string,
	juvCount: number,
	encounterCount = juvCount
): StatsPerDayAndSpeciesResult {
	return {
		visit_date: date,
		species_name: species,
		encounter_count: encounterCount,
		juv_count: juvCount,
		postjuv_count: 0,
		pullus_count: 0,
		weighed_birds_count: 0,
		min_weight: 0,
		max_weight: 0
	};
}
