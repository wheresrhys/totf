import { describe, it, expect } from 'vitest';
import {
	calculateEncounterRetraps,
	calculateRetraps,
	deriveSpeciesTotalsRow,
	deriveSpeciesTotalsRowByEncounter
} from '../species-totals';
import type { SpeciesTotalsRow } from '../../types';
import { buildBySpeciesStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';
import type { StatsCacheBySpeciesResult } from '@/modules/stats/browser';

// This file's tests assert against a specific full row shape (not just the
// field(s) each test overrides), so the shared builder's own defaults don't
// apply here — these are the exact values the file's original local
// `buildStat` defaulted to. `time_period` is genuinely null here (a
// species-grouped, ungrouped-by-time row), but `StatsCacheBySpeciesResult`
// (`modules/stats`) inherits `SimpleStatsCacheBySpecies`' NOT NULL constraint on
// that column, so even a direct `Partial<StatsCacheBySpeciesResult>` assertion
// doesn't compile (#895) — re-probed in #1419.
// eslint-disable-next-line no-restricted-syntax -- see comment above
const fullRowOverrides = {
	species_name: 'Blue Tit',
	time_period: null,
	species_count: 1,
	bird_count: 6,
	encounter_count: 7,
	new_bird_count: 4,
	pullus_bird_count: 1,
	juv_bird_count: 2,
	postjuv_bird_count: 1,
	adult_bird_count: 1,
	unknown_age_bird_count: 1
} as unknown as Partial<StatsCacheBySpeciesResult>;

describe('calculateRetraps', () => {
	it('computes bird_count minus new_bird_count for a typical row', () => {
		const stat = buildBySpeciesStatsRow({ bird_count: 10, new_bird_count: 3 });
		expect(calculateRetraps(stat)).toBe(7);
	});

	it('returns 0 when every bird is new (bird_count === new_bird_count)', () => {
		const stat = buildBySpeciesStatsRow({ bird_count: 5, new_bird_count: 5 });
		expect(calculateRetraps(stat)).toBe(0);
	});

	it('returns bird_count when new_bird_count is 0 (no new birds)', () => {
		const stat = buildBySpeciesStatsRow({ bird_count: 8, new_bird_count: 0 });
		expect(calculateRetraps(stat)).toBe(8);
	});
});

describe('deriveSpeciesTotalsRow', () => {
	it('maps every StatsCacheBySpeciesResult bucket field to its SpeciesTotalsRow counterpart', () => {
		const stat = buildBySpeciesStatsRow(fullRowOverrides);
		expect(deriveSpeciesTotalsRow(stat)).toEqual({
			speciesName: 'Blue Tit',
			sessionsCount: 4,
			encounterCount: 7,
			maxPerSession: 3,
			individualsCount: 6,
			newCount: 4,
			retrapsCount: 2,
			pullusCount: 1,
			juvsCount: 2,
			postjuvCount: 1,
			adultsCount: 1,
			unknownAgeCount: 1,
			max_weight: stat.max_weight,
			avg_weight: stat.avg_weight,
			min_weight: stat.min_weight,
			median_weight: stat.median_weight,
			max_wing: stat.max_wing,
			avg_wing: stat.avg_wing,
			min_wing: stat.min_wing,
			median_wing: stat.median_wing
		});
	});

	it('carries all 8 biometric fields straight through from the input row (#1430)', () => {
		const stat = buildBySpeciesStatsRow({
			max_weight: 21.3,
			avg_weight: 18.2,
			min_weight: 15.1,
			median_weight: 17.9,
			max_wing: 71,
			avg_wing: 69.4,
			min_wing: 67,
			median_wing: 69
		});
		expect(deriveSpeciesTotalsRow(stat)).toMatchObject({
			max_weight: 21.3,
			avg_weight: 18.2,
			min_weight: 15.1,
			median_weight: 17.9,
			max_wing: 71,
			avg_wing: 69.4,
			min_wing: 67,
			median_wing: 69
		});
	});

	it('passes a null biometric field through unchanged (species with no biometric-eligible encounters)', () => {
		const stat = buildBySpeciesStatsRow({
			max_weight: null,
			avg_weight: null,
			min_weight: null,
			median_weight: null,
			max_wing: null,
			avg_wing: null,
			min_wing: null,
			median_wing: null
		});
		expect(deriveSpeciesTotalsRow(stat)).toMatchObject({
			max_weight: null,
			avg_weight: null,
			min_weight: null,
			median_weight: null,
			max_wing: null,
			avg_wing: null,
			min_wing: null,
			median_wing: null
		});
	});

	it('computes retrapsCount via the shared calculateRetraps helper', () => {
		const stat = buildBySpeciesStatsRow({ bird_count: 10, new_bird_count: 3 });
		expect(deriveSpeciesTotalsRow(stat).retrapsCount).toBe(7);
	});

	it('maps max_per_session to maxPerSession', () => {
		const stat = buildBySpeciesStatsRow({ max_per_session: 9 });
		expect(deriveSpeciesTotalsRow(stat).maxPerSession).toBe(9);
	});
});

describe('calculateEncounterRetraps', () => {
	it('computes encounter_count minus new_bird_count for a typical row', () => {
		const stat = buildBySpeciesStatsRow({
			encounter_count: 10,
			new_bird_count: 3
		});
		expect(calculateEncounterRetraps(stat)).toBe(7);
	});

	it('returns 0 when every encounter is new (encounter_count === new_bird_count)', () => {
		const stat = buildBySpeciesStatsRow({
			encounter_count: 5,
			new_bird_count: 5
		});
		expect(calculateEncounterRetraps(stat)).toBe(0);
	});

	it('returns encounter_count when new_bird_count is 0 (all retraps)', () => {
		const stat = buildBySpeciesStatsRow({
			encounter_count: 8,
			new_bird_count: 0
		});
		expect(calculateEncounterRetraps(stat)).toBe(8);
	});
});

describe('deriveSpeciesTotalsRowByEncounter', () => {
	it('maps each age-bucket *_enc_count field to the correct SpeciesTotalsRow property', () => {
		const stat = buildBySpeciesStatsRow(fullRowOverrides);
		expect(deriveSpeciesTotalsRowByEncounter(stat)).toEqual({
			speciesName: 'Blue Tit',
			sessionsCount: 4,
			encounterCount: 7,
			maxPerSession: 3,
			individualsCount: 6,
			newCount: 4,
			retrapsCount: 3,
			pullusCount: 2,
			juvsCount: 3,
			postjuvCount: 1,
			adultsCount: 1,
			unknownAgeCount: 0,
			max_weight: stat.max_weight,
			avg_weight: stat.avg_weight,
			min_weight: stat.min_weight,
			median_weight: stat.median_weight,
			max_wing: stat.max_wing,
			avg_wing: stat.avg_wing,
			min_wing: stat.min_wing,
			median_wing: stat.median_wing
		});
	});

	it('carries all 8 biometric fields straight through from the input row (#1430)', () => {
		const stat = buildBySpeciesStatsRow({
			max_weight: 21.3,
			avg_weight: 18.2,
			min_weight: 15.1,
			median_weight: 17.9,
			max_wing: 71,
			avg_wing: 69.4,
			min_wing: 67,
			median_wing: 69
		});
		expect(deriveSpeciesTotalsRowByEncounter(stat)).toMatchObject({
			max_weight: 21.3,
			avg_weight: 18.2,
			min_weight: 15.1,
			median_weight: 17.9,
			max_wing: 71,
			avg_wing: 69.4,
			min_wing: 67,
			median_wing: 69
		});
	});

	it('passes a null biometric field through unchanged (species with no biometric-eligible encounters)', () => {
		const stat = buildBySpeciesStatsRow({
			max_weight: null,
			avg_weight: null,
			min_weight: null,
			median_weight: null,
			max_wing: null,
			avg_wing: null,
			min_wing: null,
			median_wing: null
		});
		expect(deriveSpeciesTotalsRowByEncounter(stat)).toMatchObject({
			max_weight: null,
			avg_weight: null,
			min_weight: null,
			median_weight: null,
			max_wing: null,
			avg_wing: null,
			min_wing: null,
			median_wing: null
		});
	});

	it.each<{
		sourceField: keyof StatsCacheBySpeciesResult;
		resultField: keyof SpeciesTotalsRow;
	}>([
		{ sourceField: 'pullus_enc_count', resultField: 'pullusCount' },
		{ sourceField: 'juv_enc_count', resultField: 'juvsCount' },
		{ sourceField: 'postjuv_enc_count', resultField: 'postjuvCount' },
		{ sourceField: 'adult_enc_count', resultField: 'adultsCount' },
		{ sourceField: 'unknown_age_enc_count', resultField: 'unknownAgeCount' }
	])(
		'sources $resultField from $sourceField',
		({ sourceField, resultField }) => {
			const stat = buildBySpeciesStatsRow({
				[sourceField]: 9
			} as Partial<StatsCacheBySpeciesResult>);
			expect(deriveSpeciesTotalsRowByEncounter(stat)[resultField]).toBe(9);
		}
	);

	it('sources newCount from new_bird_count, not any *_enc_count field', () => {
		const stat = buildBySpeciesStatsRow({
			new_bird_count: 4
		});
		const row = deriveSpeciesTotalsRowByEncounter(stat);
		expect(row.newCount).toBe(4);
	});

	it('maps max_per_session to maxPerSession', () => {
		const stat = buildBySpeciesStatsRow({ max_per_session: 9 });
		expect(deriveSpeciesTotalsRowByEncounter(stat).maxPerSession).toBe(9);
	});
});
