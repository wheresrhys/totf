import type { AggregateStatsResult } from './db';

export type SpeciesTotalsRow = {
	speciesName: string;
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

export function deriveSpeciesTotalsRow(
	stat: AggregateStatsResult
): SpeciesTotalsRow {
	return {
		speciesName: stat.species_name,
		encounterCount: stat.encounter_count,
		individualsCount: stat.bird_count,
		newCount: stat.new_bird_count,
		retrapsCount: stat.bird_count - stat.new_bird_count,
		pullusCount: stat.pullus_count,
		juvsCount: stat.juv_count,
		postjuvCount: stat.postjuv_count,
		adultsCount: stat.adult_count,
		unknownAgeCount: stat.unknown_age_count,
		newYoungCount: stat.new_young_count
	};
}
