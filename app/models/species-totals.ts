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

/**
 * Encounter-level retraps. `record_type` `'N'` can only occur once per bird
 * (see #601), so the bird-based and encounter-based "New" counts are
 * identical by construction — there's no separate `new_enc_count` to
 * subtract, so this reuses `new_bird_count` directly.
 */
export function calculateEncounterRetraps(stat: AggregateStatsResult): number {
	return stat.encounter_count - stat.new_bird_count;
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
		pullusCount: stat.pullus_bird_count,
		juvsCount: stat.juv_bird_count,
		postjuvCount: stat.postjuv_bird_count,
		adultsCount: stat.adult_bird_count,
		unknownAgeCount: stat.unknown_age_bird_count,
		newYoungCount: stat.new_young_bird_count
	};
}

/**
 * Encounter-based sibling of `deriveSpeciesTotalsRow` — same
 * `SpeciesTotalsRow` shape, but age-bucket fields are sourced from the
 * `*_enc_count` columns. `newCount`/`newYoungCount` still read
 * `new_bird_count`/`new_young_bird_count` — no `*_enc_count` variant exists
 * for either, since both are identical to the bird-based count by
 * construction (see #601).
 */
export function deriveSpeciesTotalsRowByEncounter(
	stat: AggregateStatsResult
): SpeciesTotalsRow {
	return {
		speciesName: stat.species_name,
		sessionsCount: stat.session_count,
		encounterCount: stat.encounter_count,
		individualsCount: stat.bird_count,
		newCount: stat.new_bird_count,
		retrapsCount: calculateEncounterRetraps(stat),
		pullusCount: stat.pullus_enc_count,
		juvsCount: stat.juv_enc_count,
		postjuvCount: stat.postjuv_enc_count,
		adultsCount: stat.adult_enc_count,
		unknownAgeCount: stat.unknown_age_enc_count,
		newYoungCount: stat.new_young_bird_count
	};
}
