import type { AggregateStatsResult } from './db';

export type SpeciesTotalsRow = {
	speciesName: string;
	sessionsCount: number;
	encounterCount: number;
	individualsCount: number;
	newCount: number;
	retrapsCount: number;
	pullusCount: number;
	juvsCount: number;
	postjuvCount: number;
	adultsCount: number;
	unknownAgeCount: number;
	newYoungCount: number;
};

/** Every bird in the period has ≥1 'N' encounter or none — an exhaustive partition. */
export function calculateRetraps(stat: AggregateStatsResult): number {
	return stat.bird_count - stat.new_bird_count;
}

export function deriveSpeciesTotalsRow(
	stat: AggregateStatsResult
): SpeciesTotalsRow {
	return {
		speciesName: stat.species_name,
		sessionsCount: stat.session_count,
		encounterCount: stat.encounter_count,
		individualsCount: stat.bird_count,
		newCount: stat.new_bird_count,
		retrapsCount: calculateRetraps(stat),
		pullusCount: stat.pullus_count,
		juvsCount: stat.juv_count,
		postjuvCount: stat.postjuv_count,
		adultsCount: stat.adult_count,
		unknownAgeCount: stat.unknown_age_count,
		newYoungCount: stat.new_young_count
	};
}
