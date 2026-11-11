import { format as formatDate } from 'date-fns';
// `StatsResult` (the union of both cache grains) rather than one member of it:
// the summary pages' period totals are all-species-combined cells and the
// species page's are by-species ones, and neither deriver reads `species_name`
// — the one column the two members differ on.
import type { StatsResult } from '@/modules/stats/browser';
import type { PeriodTotalsGrouping, PeriodTotalsRow } from '../types';
import { calculateEncounterRetraps, calculateRetraps } from './species-totals';

export function derivePeriodTotalsRowByBird(
	stat: StatsResult
): PeriodTotalsRow {
	return {
		timePeriod: stat.time_period,
		sessionsCount: stat.session_count,
		speciesCount: stat.species_count,
		encounterCount: stat.encounter_count,
		maxPerSession: stat.max_per_session,
		individualsCount: stat.bird_count,
		new: stat.new_bird_count,
		retraps: calculateRetraps(stat),
		pullus: stat.pullus_bird_count,
		juvs: stat.juv_bird_count,
		postjuv: stat.postjuv_bird_count,
		adults: stat.adult_bird_count,
		unknownAge: stat.unknown_age_bird_count
	};
}

/**
 * Encounter-based sibling of `derivePeriodTotalsRowByBird` — same
 * `PeriodTotalsRow` shape, but age-bucket fields are sourced from the
 * `*_enc_count` columns. `new` still reads `new_bird_count` — no
 * `*_enc_count` variant exists for it, since it's identical to the
 * bird-based count by construction (see #601).
 */
export function derivePeriodTotalsRowByEncounter(
	stat: StatsResult
): PeriodTotalsRow {
	return {
		timePeriod: stat.time_period,
		sessionsCount: stat.session_count,
		speciesCount: stat.species_count,
		encounterCount: stat.encounter_count,
		maxPerSession: stat.max_per_session,
		individualsCount: stat.bird_count,
		new: stat.new_bird_count,
		retraps: calculateEncounterRetraps(stat),
		pullus: stat.pullus_enc_count,
		juvs: stat.juv_enc_count,
		postjuv: stat.postjuv_enc_count,
		adults: stat.adult_enc_count,
		unknownAge: stat.unknown_age_enc_count
	};
}

// `timePeriod` is a DemOn-style date-only string (e.g. "2026-08-16" for a
// day, "2026-08-01" for a month, "2026-01-01" for a year); `new Date(...)`
// parses it as UTC midnight, consistent with the existing single-case
// convention already used in `effort/page.tsx`. Known non-blocking risk: on a
// negative-UTC-offset runtime this can render a period's first day as the
// previous day — pre-existing behaviour, not introduced here.
export function formatPeriodTotalsLabel(
	timeInterval: PeriodTotalsGrouping,
	timePeriod: string
): string {
	const date = new Date(timePeriod);
	switch (timeInterval) {
		case 'year':
			return formatDate(date, 'yyyy');
		case 'month':
			return formatDate(date, 'MMMM yyyy');
		case 'day':
			return formatDate(date, 'do MMMM yyyy');
	}
}
