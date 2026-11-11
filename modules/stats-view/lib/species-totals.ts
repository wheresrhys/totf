import {
	BiometricStatNames,
	type BiometricStatName,
	type StatsCacheBySpeciesResult,
	type StatsResult
} from '@/modules/stats/browser';
import type { SpeciesTotalsRow } from '../types';

// The two retrap derivations below read three count columns and nothing else,
// so they are typed on just those rather than on a whole row — which is what
// lets both the by-species callers here and `period-totals.ts`' either-grain
// `StatsResult` ones use them unchanged.
type RetrapCountColumns = Pick<
	StatsResult,
	'bird_count' | 'new_bird_count' | 'encounter_count'
>;

/** Every bird in the period has ≥1 'N' encounter or none — an exhaustive partition. */
export function calculateRetraps(stat: RetrapCountColumns): number {
	return stat.bird_count - stat.new_bird_count;
}

/**
 * Encounter-level retraps. `record_type` `'N'` can only occur once per bird
 * (see #601), so the bird-based and encounter-based "New" counts are
 * identical by construction — there's no separate `new_enc_count` to
 * subtract, so this reuses `new_bird_count` directly.
 */
export function calculateEncounterRetraps(stat: RetrapCountColumns): number {
	return stat.encounter_count - stat.new_bird_count;
}

/**
 * Copies the 8 wing/weight biometric fields straight across from a cache row
 * — `SpeciesTotalsRow` uses the same field names for these (#1430), so there
 * is nothing to derive, just a single place both derivers below read the 8
 * fields from so they can't drift from `BiometricStatNames`
 * (`@/modules/stats/browser`) or from each other. A species with no
 * biometric-eligible encounters carries a real `null` through unchanged.
 */
function extractBiometricFields(
	stat: StatsCacheBySpeciesResult
): Record<BiometricStatName, number | null> {
	return BiometricStatNames.reduce<Record<BiometricStatName, number | null>>(
		(fields, name) => {
			fields[name] = stat[name];
			return fields;
		},
		{} as Record<BiometricStatName, number | null>
	);
}

export function deriveSpeciesTotalsRow(
	stat: StatsCacheBySpeciesResult
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
		unknownAgeCount: stat.unknown_age_bird_count,
		...extractBiometricFields(stat)
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
	stat: StatsCacheBySpeciesResult
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
		unknownAgeCount: stat.unknown_age_enc_count,
		...extractBiometricFields(stat)
	};
}
