import { describe, it, expect } from 'vitest';
import {
	calculateEncounterRetraps,
	calculateRetraps,
	deriveSpeciesTotalsRow,
	deriveSpeciesTotalsRowByEncounter
} from '../species-totals';
import type { CoreStatsResult } from '../../models/db';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

// This file's tests assert against a specific full row shape (not just the
// field(s) each test overrides), so the shared builder's own defaults don't
// apply here — these are the exact values the file's original local
// `buildStat` defaulted to. `time_period` is genuinely null here (a
// species-grouped, ungrouped-by-time row), but CoreStatsResult's
// NonNullable mapped type (app/models/db.ts) assumes every column is always
// present, so a direct `Partial<CoreStatsResult>` assertion doesn't compile
// (#895).
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
} as unknown as Partial<CoreStatsResult>;

describe('calculateRetraps', () => {
	it('computes bird_count minus new_bird_count for a typical row', () => {
		const stat = buildCoreStatsRow({ bird_count: 10, new_bird_count: 3 });
		expect(calculateRetraps(stat)).toBe(7);
	});

	it('returns 0 when every bird is new (bird_count === new_bird_count)', () => {
		const stat = buildCoreStatsRow({ bird_count: 5, new_bird_count: 5 });
		expect(calculateRetraps(stat)).toBe(0);
	});

	it('returns bird_count when new_bird_count is 0 (no new birds)', () => {
		const stat = buildCoreStatsRow({ bird_count: 8, new_bird_count: 0 });
		expect(calculateRetraps(stat)).toBe(8);
	});
});

describe('deriveSpeciesTotalsRow', () => {
	it('maps every CoreStatsResult bucket field to its SpeciesTotalsRow counterpart', () => {
		const stat = buildCoreStatsRow(fullRowOverrides);
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
			unknownAgeCount: 1
		});
	});

	it('computes retrapsCount as bird_count minus new_bird_count', () => {
		const stat = buildCoreStatsRow({ bird_count: 10, new_bird_count: 3 });
		expect(deriveSpeciesTotalsRow(stat).retrapsCount).toBe(7);
	});

	it('returns retrapsCount of 0 when every bird is new (bird_count === new_bird_count)', () => {
		const stat = buildCoreStatsRow({ bird_count: 5, new_bird_count: 5 });
		expect(deriveSpeciesTotalsRow(stat).retrapsCount).toBe(0);
	});

	it('returns retrapsCount equal to bird_count when new_bird_count is 0', () => {
		const stat = buildCoreStatsRow({ bird_count: 8, new_bird_count: 0 });
		expect(deriveSpeciesTotalsRow(stat).retrapsCount).toBe(8);
	});

	it('maps max_per_session to maxPerSession', () => {
		const stat = buildCoreStatsRow({ max_per_session: 9 });
		expect(deriveSpeciesTotalsRow(stat).maxPerSession).toBe(9);
	});
});

describe('calculateEncounterRetraps', () => {
	it('computes encounter_count minus new_bird_count for a typical row', () => {
		const stat = buildCoreStatsRow({ encounter_count: 10, new_bird_count: 3 });
		expect(calculateEncounterRetraps(stat)).toBe(7);
	});

	it('returns 0 when every encounter is new (encounter_count === new_bird_count)', () => {
		const stat = buildCoreStatsRow({ encounter_count: 5, new_bird_count: 5 });
		expect(calculateEncounterRetraps(stat)).toBe(0);
	});

	it('returns encounter_count when new_bird_count is 0 (all retraps)', () => {
		const stat = buildCoreStatsRow({ encounter_count: 8, new_bird_count: 0 });
		expect(calculateEncounterRetraps(stat)).toBe(8);
	});
});

describe('deriveSpeciesTotalsRowByEncounter', () => {
	it('maps each age-bucket *_enc_count field to the correct SpeciesTotalsRow property', () => {
		const stat = buildCoreStatsRow(fullRowOverrides);
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
			unknownAgeCount: 0
		});
	});

	it('sources pullusCount from pullus_enc_count', () => {
		const stat = buildCoreStatsRow({ pullus_enc_count: 9 });
		expect(deriveSpeciesTotalsRowByEncounter(stat).pullusCount).toBe(9);
	});

	it('sources juvsCount from juv_enc_count', () => {
		const stat = buildCoreStatsRow({ juv_enc_count: 9 });
		expect(deriveSpeciesTotalsRowByEncounter(stat).juvsCount).toBe(9);
	});

	it('sources postjuvCount from postjuv_enc_count', () => {
		const stat = buildCoreStatsRow({ postjuv_enc_count: 9 });
		expect(deriveSpeciesTotalsRowByEncounter(stat).postjuvCount).toBe(9);
	});

	it('sources adultsCount from adult_enc_count', () => {
		const stat = buildCoreStatsRow({ adult_enc_count: 9 });
		expect(deriveSpeciesTotalsRowByEncounter(stat).adultsCount).toBe(9);
	});

	it('sources unknownAgeCount from unknown_age_enc_count', () => {
		const stat = buildCoreStatsRow({ unknown_age_enc_count: 9 });
		expect(deriveSpeciesTotalsRowByEncounter(stat).unknownAgeCount).toBe(9);
	});

	it('sources newCount from new_bird_count, not any *_enc_count field', () => {
		const stat = buildCoreStatsRow({
			new_bird_count: 4
		});
		const row = deriveSpeciesTotalsRowByEncounter(stat);
		expect(row.newCount).toBe(4);
	});

	it('maps max_per_session to maxPerSession', () => {
		const stat = buildCoreStatsRow({ max_per_session: 9 });
		expect(deriveSpeciesTotalsRowByEncounter(stat).maxPerSession).toBe(9);
	});
});
