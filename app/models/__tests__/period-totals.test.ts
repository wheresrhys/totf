import { describe, it, expect } from 'vitest';
import {
	derivePeriodTotalsRow,
	derivePeriodTotalsRowByEncounter,
	formatPeriodTotalsLabel,
	type PeriodTotalsGrouping
} from '../period-totals';
import type { AggregateStatsResult } from '../db';

function buildStat(
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
	return {
		species_name: null,
		time_period: '2026-08-16',
		session_count: 4,
		total_effort: '18:00:00',
		effort_per_session: '02:00:00',
		effort_per_encounter: '02:34:17',
		avg_encounters_per_session: 1.75,
		max_per_session: 3,
		species_count: 5,
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
		pullus_count: 1,
		juv_count: 2,
		postjuv_count: 1,
		adult_count: 1,
		unknown_age_count: 1,
		new_young_count: 3,
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
	} as AggregateStatsResult;
}

describe('derivePeriodTotalsRow', () => {
	it('maps every AggregateStatsResult bucket field to its PeriodTotalsRow counterpart', () => {
		const stat = buildStat();
		expect(derivePeriodTotalsRow(stat)).toEqual({
			timePeriod: '2026-08-16',
			sessionsCount: 4,
			effortSeconds: 64800,
			speciesCount: 5,
			encounterCount: 7,
			individualsCount: 6,
			new: 4,
			retraps: 2,
			pullus: 1,
			juvs: 2,
			postjuv: 1,
			adults: 1,
			unknownAge: 1,
			newYoung: 3
		});
	});

	it('maps species_count to speciesCount', () => {
		const stat = buildStat({ species_count: 9 });
		expect(derivePeriodTotalsRow(stat).speciesCount).toBe(9);
	});

	it('maps session_count to sessionsCount and total_effort (via postgresIntervalToSeconds) to effortSeconds', () => {
		const stat = buildStat({ session_count: 11, total_effort: '01:00:00' });
		const row = derivePeriodTotalsRow(stat);
		expect(row.sessionsCount).toBe(11);
		expect(row.effortSeconds).toBe(3600);
	});

	it('returns all-zero fields for a period with no activity', () => {
		const stat = buildStat({
			session_count: 0,
			total_effort: '00:00:00',
			species_count: 0,
			bird_count: 0,
			encounter_count: 0,
			new_bird_count: 0,
			pullus_count: 0,
			juv_count: 0,
			postjuv_count: 0,
			adult_count: 0,
			unknown_age_count: 0,
			new_young_count: 0
		});
		expect(derivePeriodTotalsRow(stat)).toEqual({
			timePeriod: '2026-08-16',
			sessionsCount: 0,
			effortSeconds: 0,
			speciesCount: 0,
			encounterCount: 0,
			individualsCount: 0,
			new: 0,
			retraps: 0,
			pullus: 0,
			juvs: 0,
			postjuv: 0,
			adults: 0,
			unknownAge: 0,
			newYoung: 0
		});
	});

	it('computes retraps via the shared calculateRetraps helper', () => {
		const stat = buildStat({ bird_count: 10, new_bird_count: 3 });
		expect(derivePeriodTotalsRow(stat).retraps).toBe(7);
	});
});

describe('derivePeriodTotalsRowByEncounter', () => {
	it('maps each field correctly, with age-bucket fields from *_enc_count and New/New young from new_bird_count/new_young_bird_count', () => {
		const stat = buildStat();
		expect(derivePeriodTotalsRowByEncounter(stat)).toEqual({
			timePeriod: '2026-08-16',
			sessionsCount: 4,
			effortSeconds: 64800,
			speciesCount: 5,
			encounterCount: 7,
			individualsCount: 6,
			new: 4,
			retraps: 3,
			pullus: 2,
			juvs: 3,
			postjuv: 1,
			adults: 1,
			unknownAge: 0,
			newYoung: 3
		});
	});

	it('computes retraps via the shared calculateEncounterRetraps helper', () => {
		const stat = buildStat({ encounter_count: 10, new_bird_count: 3 });
		expect(derivePeriodTotalsRowByEncounter(stat).retraps).toBe(7);
	});
});

describe('formatPeriodTotalsLabel', () => {
	it.each<[PeriodTotalsGrouping, string, string]>([
		['year', '2026-01-01', '2026'],
		['month', '2026-08-01', 'August 2026'],
		['day', '2026-08-16', '16th August 2026']
	])('formats a %s grouping as "%s"', (grouping, timePeriod, expected) => {
		expect(formatPeriodTotalsLabel(grouping, timePeriod)).toBe(expected);
	});
});
