import type { SpeciesStatsRow } from './species-stats';

export type SpeciesTotalsRow = {
	speciesName: string;
	sessionsCount: number;
	encounterCount: number;
	maxPerSession: number;
	individualsCount: number;
	newCount: number;
	retrapsCount: number;
	pullusCount: number;
	juvsCount: number;
	postjuvCount: number;
	adultsCount: number;
	unknownAgeCount: number;
};

/** Every bird in the period has ≥1 'N' encounter or none — an exhaustive partition. */
export function calculateRetraps(stat: SpeciesStatsRow): number {
	return stat.bird_count - stat.new_bird_count;
}

/**
 * Encounter-level retraps. `record_type` `'N'` can only occur once per bird
 * (see #601), so the bird-based and encounter-based "New" counts are
 * identical by construction — there's no separate `new_enc_count` to
 * subtract, so this reuses `new_bird_count` directly.
 */
export function calculateEncounterRetraps(stat: SpeciesStatsRow): number {
	return stat.encounter_count - stat.new_bird_count;
}

export function deriveSpeciesTotalsRow(
	stat: SpeciesStatsRow
): SpeciesTotalsRow {
	return {
		speciesName: stat.species_name,
		sessionsCount: stat.session_count,
		encounterCount: stat.encounter_count,
		maxPerSession: stat.max_per_session,
		individualsCount: stat.bird_count,
		newCount: stat.new_bird_count,
		retrapsCount: calculateRetraps(stat),
		pullusCount: stat.pullus_bird_count,
		juvsCount: stat.juv_bird_count,
		postjuvCount: stat.postjuv_bird_count,
		adultsCount: stat.adult_bird_count,
		unknownAgeCount: stat.unknown_age_bird_count
	};
}

/**
 * Encounter-based sibling of `deriveSpeciesTotalsRow` — same
 * `SpeciesTotalsRow` shape, but age-bucket fields are sourced from the
 * `*_enc_count` columns. `newCount` still reads `new_bird_count` — no
 * `*_enc_count` variant exists for it, since it's identical to the
 * bird-based count by construction (see #601).
 */
export function deriveSpeciesTotalsRowByEncounter(
	stat: SpeciesStatsRow
): SpeciesTotalsRow {
	return {
		speciesName: stat.species_name,
		sessionsCount: stat.session_count,
		encounterCount: stat.encounter_count,
		maxPerSession: stat.max_per_session,
		individualsCount: stat.bird_count,
		newCount: stat.new_bird_count,
		retrapsCount: calculateEncounterRetraps(stat),
		pullusCount: stat.pullus_enc_count,
		juvsCount: stat.juv_enc_count,
		postjuvCount: stat.postjuv_enc_count,
		adultsCount: stat.adult_enc_count,
		unknownAgeCount: stat.unknown_age_enc_count
	};
}
