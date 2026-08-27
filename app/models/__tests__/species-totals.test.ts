import { describe, it, expect } from 'vitest';
import {
	calculateEncounterRetraps,
	calculateRetraps,
	deriveSpeciesTotalsRow,
	deriveSpeciesTotalsRowByEncounter
} from '../species-totals';
import type { AggregateStatsResult } from '../db';

function buildStat(
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
	return {
		species_name: 'Blue Tit',
		time_period: null,
		session_count: 4,
		total_effort: '18:00:00',
		effort_per_session: '02:00:00',
		effort_per_encounter: '02:34:17',
		avg_encounters_per_session: 1.75,
		max_per_session: 3,
		species_count: 1,
		bird_count: 6,
		encounter_count: 7,
		new_bird_count: 4,
		max_new_per_session: 3,
		max_weight: 13.1,
		avg_weight: 11.2,
		min_weight: 9.8,
		median_weight: 10.8,
		max_wing: 68,
		avg_wing: 66.6,
		min_wing: 65,
		median_wing: 67,
		pullus_bird_count: 1,
		juv_bird_count: 2,
		postjuv_bird_count: 1,
		adult_bird_count: 1,
		unknown_age_bird_count: 1,
		new_young_bird_count: 3,
		pullus_enc_count: 2,
		juv_enc_count: 3,
		postjuv_enc_count: 1,
		adult_enc_count: 1,
		unknown_age_enc_count: 0,
		...overrides
	} as unknown as AggregateStatsResult;
}

describe('calculateRetraps', () => {
	it('computes bird_count minus new_bird_count for a typical row', () => {
		const stat = buildStat({ bird_count: 10, new_bird_count: 3 });
		expect(calculateRetraps(stat)).toBe(7);
	});

	it('returns 0 when every bird is new (bird_count === new_bird_count)', () => {
		const stat = buildStat({ bird_count: 5, new_bird_count: 5 });
		expect(calculateRetraps(stat)).toBe(0);
	});

	it('returns bird_count when new_bird_count is 0 (no new birds)', () => {
		const stat = buildStat({ bird_count: 8, new_bird_count: 0 });
		expect(calculateRetraps(stat)).toBe(8);
	});
});

describe('deriveSpeciesTotalsRow', () => {
	it('maps every AggregateStatsResult bucket field to its SpeciesTotalsRow counterpart', () => {
		const stat = buildStat();
		expect(deriveSpeciesTotalsRow(stat)).toEqual({
			speciesName: 'Blue Tit',
			sessionsCount: 4,
			encounterCount: 7,
			individualsCount: 6,
			newCount: 4,
			retrapsCount: 2,
			pullusCount: 1,
			juvsCount: 2,
			postjuvCount: 1,
			adultsCount: 1,
			unknownAgeCount: 1,
			newYoungCount: 3
		});
	});

	it('computes retrapsCount as bird_count minus new_bird_count', () => {
		const stat = buildStat({ bird_count: 10, new_bird_count: 3 });
		expect(deriveSpeciesTotalsRow(stat).retrapsCount).toBe(7);
	});

	it('returns retrapsCount of 0 when every bird is new (bird_count === new_bird_count)', () => {
		const stat = buildStat({ bird_count: 5, new_bird_count: 5 });
		expect(deriveSpeciesTotalsRow(stat).retrapsCount).toBe(0);
	});

	it('returns retrapsCount equal to bird_count when new_bird_count is 0', () => {
		const stat = buildStat({ bird_count: 8, new_bird_count: 0 });
		expect(deriveSpeciesTotalsRow(stat).retrapsCount).toBe(8);
	});
});

describe('calculateEncounterRetraps', () => {
	it('computes encounter_count minus new_bird_count for a typical row', () => {
		const stat = buildStat({ encounter_count: 10, new_bird_count: 3 });
		expect(calculateEncounterRetraps(stat)).toBe(7);
	});

	it('returns 0 when every encounter is new (encounter_count === new_bird_count)', () => {
		const stat = buildStat({ encounter_count: 5, new_bird_count: 5 });
		expect(calculateEncounterRetraps(stat)).toBe(0);
	});

	it('returns encounter_count when new_bird_count is 0 (all retraps)', () => {
		const stat = buildStat({ encounter_count: 8, new_bird_count: 0 });
		expect(calculateEncounterRetraps(stat)).toBe(8);
	});
});

describe('deriveSpeciesTotalsRowByEncounter', () => {
	it('maps each age-bucket *_enc_count field to the correct SpeciesTotalsRow property', () => {
		const stat = buildStat();
		expect(deriveSpeciesTotalsRowByEncounter(stat)).toEqual({
			speciesName: 'Blue Tit',
			sessionsCount: 4,
			encounterCount: 7,
			individualsCount: 6,
			newCount: 4,
			retrapsCount: 3,
			pullusCount: 2,
			juvsCount: 3,
			postjuvCount: 1,
			adultsCount: 1,
			unknownAgeCount: 0,
			newYoungCount: 3
		});
	});

	it('sources pullusCount from pullus_enc_count', () => {
		const stat = buildStat({ pullus_enc_count: 9 });
		expect(deriveSpeciesTotalsRowByEncounter(stat).pullusCount).toBe(9);
	});

	it('sources juvsCount from juv_enc_count', () => {
		const stat = buildStat({ juv_enc_count: 9 });
		expect(deriveSpeciesTotalsRowByEncounter(stat).juvsCount).toBe(9);
	});

	it('sources postjuvCount from postjuv_enc_count', () => {
		const stat = buildStat({ postjuv_enc_count: 9 });
		expect(deriveSpeciesTotalsRowByEncounter(stat).postjuvCount).toBe(9);
	});

	it('sources adultsCount from adult_enc_count', () => {
		const stat = buildStat({ adult_enc_count: 9 });
		expect(deriveSpeciesTotalsRowByEncounter(stat).adultsCount).toBe(9);
	});

	it('sources unknownAgeCount from unknown_age_enc_count', () => {
		const stat = buildStat({ unknown_age_enc_count: 9 });
		expect(deriveSpeciesTotalsRowByEncounter(stat).unknownAgeCount).toBe(9);
	});

	it('sources newCount/newYoungCount from new_bird_count/new_young_bird_count, not any *_enc_count field', () => {
		const stat = buildStat({
			new_bird_count: 4,
			new_young_bird_count: 3
		});
		const row = deriveSpeciesTotalsRowByEncounter(stat);
		expect(row.newCount).toBe(4);
		expect(row.newYoungCount).toBe(3);
	});
});
