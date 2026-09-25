import { describe, it, expect } from 'vitest';
import {
	derivePeriodTotalsRowByBird,
	derivePeriodTotalsRowByEncounter,
	formatPeriodTotalsLabel,
	type PeriodTotalsGrouping
} from '../period-totals';
import type { CoreStatsResult } from '../../models/db';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

// This file's tests assert against a specific full row shape (not just the
// field(s) each test overrides), so the shared builder's own defaults don't
// apply here — these are the exact values the file's original local
// `buildStat` defaulted to.
const fullRowOverrides: Partial<CoreStatsResult> = {
	time_period: '2026-08-16',
	species_count: 5,
	bird_count: 6,
	encounter_count: 7,
	new_bird_count: 4,
	pullus_bird_count: 1,
	juv_bird_count: 2,
	postjuv_bird_count: 1,
	adult_bird_count: 1,
	unknown_age_bird_count: 1
};

describe('derivePeriodTotalsRowByBird', () => {
	it('maps every CoreStatsResult bucket field to its PeriodTotalsRow counterpart', () => {
		const stat = buildCoreStatsRow(fullRowOverrides);
		expect(derivePeriodTotalsRowByBird(stat)).toEqual({
			timePeriod: '2026-08-16',
			sessionsCount: 4,
			speciesCount: 5,
			encounterCount: 7,
			maxPerSession: 3,
			individualsCount: 6,
			new: 4,
			retraps: 2,
			pullus: 1,
			juvs: 2,
			postjuv: 1,
			adults: 1,
			unknownAge: 1
		});
	});

	it('maps session_count to sessionsCount', () => {
		const stat = buildCoreStatsRow({
			session_count: 11,
			total_effort: '01:00:00'
		});
		const row = derivePeriodTotalsRowByBird(stat);
		expect(row.sessionsCount).toBe(11);
	});

	it('maps max_per_session to maxPerSession', () => {
		const stat = buildCoreStatsRow({ max_per_session: 9 });
		expect(derivePeriodTotalsRowByBird(stat).maxPerSession).toBe(9);
	});

	it('returns all-zero fields for a period with no activity', () => {
		const stat = buildCoreStatsRow({
			time_period: '2026-08-16',
			session_count: 0,
			total_effort: '00:00:00',
			species_count: 0,
			bird_count: 0,
			encounter_count: 0,
			new_bird_count: 0,
			pullus_bird_count: 0,
			juv_bird_count: 0,
			postjuv_bird_count: 0,
			adult_bird_count: 0,
			unknown_age_bird_count: 0
		});
		expect(derivePeriodTotalsRowByBird(stat)).toEqual({
			timePeriod: '2026-08-16',
			sessionsCount: 0,
			speciesCount: 0,
			encounterCount: 0,
			maxPerSession: 3,
			individualsCount: 0,
			new: 0,
			retraps: 0,
			pullus: 0,
			juvs: 0,
			postjuv: 0,
			adults: 0,
			unknownAge: 0
		});
	});
});

describe('derivePeriodTotalsRowByEncounter', () => {
	it('maps each field correctly, with age-bucket fields from *_enc_count and New from new_bird_count', () => {
		const stat = buildCoreStatsRow(fullRowOverrides);
		expect(derivePeriodTotalsRowByEncounter(stat)).toEqual({
			timePeriod: '2026-08-16',
			sessionsCount: 4,
			speciesCount: 5,
			encounterCount: 7,
			maxPerSession: 3,
			individualsCount: 6,
			new: 4,
			retraps: 3,
			pullus: 2,
			juvs: 3,
			postjuv: 1,
			adults: 1,
			unknownAge: 0
		});
	});

	it('maps max_per_session to maxPerSession', () => {
		const stat = buildCoreStatsRow({ max_per_session: 9 });
		expect(derivePeriodTotalsRowByEncounter(stat).maxPerSession).toBe(9);
	});
});

describe('formatPeriodTotalsLabel', () => {
	it.each<[PeriodTotalsGrouping, string, string]>([
		['year', '2026-01-01', '2026'],
		['month', '2026-08-01', 'August 2026'],
		['day', '2026-08-16', '16th August 2026']
	])(
		'formats a %s timeInterval as "%s"',
		(timeInterval, timePeriod, expected) => {
			expect(formatPeriodTotalsLabel(timeInterval, timePeriod)).toBe(expected);
		}
	);
});
