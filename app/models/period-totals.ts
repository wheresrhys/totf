import { format as formatDate } from 'date-fns';
import { postgresIntervalToSeconds } from '@/lib/postgres-interval';
import type { AggregateStatsResult } from './db';
import { calculateEncounterRetraps, calculateRetraps } from './species-totals';

export type PeriodTotalsGrouping = 'year' | 'month' | 'day';

// Field names for the age-class/capture-type block (`new`/`retraps`/`pullus`/
// `juvs`/`postjuv`/`adults`/`unknownAge`) deliberately match
// `StatsTableColumnConfigs`'s `StandardField` union rather than following
// `SpeciesTotalsRow`'s `*Count`-suffixed convention, so `PeriodTotalsRow` can
// be used directly as `PeriodTotalsTable`'s `SortableTable` row model without
// a remapping step — see `buildStandardColumnConfigs`.
export type PeriodTotalsRow = {
	timePeriod: string;
	sessionsCount: number;
	effortSeconds: number;
	speciesCount: number;
	encounterCount: number;
	individualsCount: number;
	new: number;
	retraps: number;
	pullus: number;
	juvs: number;
	postjuv: number;
	adults: number;
	unknownAge: number;
	newYoung: number;
};

export function derivePeriodTotalsRow(
	stat: AggregateStatsResult
): PeriodTotalsRow {
	return {
		timePeriod: stat.time_period,
		sessionsCount: stat.session_count,
		effortSeconds: postgresIntervalToSeconds(stat.total_effort),
		speciesCount: stat.species_count,
		encounterCount: stat.encounter_count,
		individualsCount: stat.bird_count,
		new: stat.new_bird_count,
		retraps: calculateRetraps(stat),
		pullus: stat.pullus_bird_count,
		juvs: stat.juv_bird_count,
		postjuv: stat.postjuv_bird_count,
		adults: stat.adult_bird_count,
		unknownAge: stat.unknown_age_bird_count,
		newYoung: stat.new_young_bird_count
	};
}

/**
 * Encounter-based sibling of `derivePeriodTotalsRow` — same
 * `PeriodTotalsRow` shape, but age-bucket fields are sourced from the
 * `*_enc_count` columns. `new`/`newYoung` still read
 * `new_bird_count`/`new_young_bird_count` — no `*_enc_count` variant exists
 * for either, since both are identical to the bird-based count by
 * construction (see #601).
 */
export function derivePeriodTotalsRowByEncounter(
	stat: AggregateStatsResult
): PeriodTotalsRow {
	return {
		timePeriod: stat.time_period,
		sessionsCount: stat.session_count,
		effortSeconds: postgresIntervalToSeconds(stat.total_effort),
		speciesCount: stat.species_count,
		encounterCount: stat.encounter_count,
		individualsCount: stat.bird_count,
		new: stat.new_bird_count,
		retraps: calculateEncounterRetraps(stat),
		pullus: stat.pullus_enc_count,
		juvs: stat.juv_enc_count,
		postjuv: stat.postjuv_enc_count,
		adults: stat.adult_enc_count,
		unknownAge: stat.unknown_age_enc_count,
		newYoung: stat.new_young_bird_count
	};
}

// `timePeriod` is a DemOn-style date-only string (e.g. "2026-08-16" for a
// day, "2026-08-01" for a month, "2026-01-01" for a year); `new Date(...)`
// parses it as UTC midnight, consistent with the existing single-case
// convention already used in `effort/page.tsx`. Known non-blocking risk: on a
// negative-UTC-offset runtime this can render a period's first day as the
// previous day — pre-existing behaviour, not introduced here.
export function formatPeriodTotalsLabel(
	grouping: PeriodTotalsGrouping,
	timePeriod: string
): string {
	const date = new Date(timePeriod);
	switch (grouping) {
		case 'year':
			return formatDate(date, 'yyyy');
		case 'month':
			return formatDate(date, 'MMMM yyyy');
		case 'day':
			return formatDate(date, 'do MMMM yyyy');
	}
}
