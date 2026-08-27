import { format as formatDate } from 'date-fns';
import type { AggregateStatsResult } from './db';
import { calculateRetraps } from './species-totals';

export type PeriodTotalsGrouping = 'year' | 'month' | 'day';

// Field names for the age-class/capture-type block (`new`/`retraps`/`pullus`/
// `juvs`/`postjuv`/`adults`/`unknownAge`) deliberately match
// `StatsTableColumnConfigs`'s `StandardField` union rather than following
// `SpeciesTotalsRow`'s `*Count`-suffixed convention, so `PeriodTotalsRow` can
// be used directly as `PeriodTotalsTable`'s `SortableTable` row model without
// a remapping step — see `buildStandardColumnConfigs`.
export type PeriodTotalsRow = {
	timePeriod: string;
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
		speciesCount: stat.species_count,
		encounterCount: stat.encounter_count,
		individualsCount: stat.bird_count,
		new: stat.new_bird_count,
		retraps: calculateRetraps(stat),
		pullus: stat.pullus_count,
		juvs: stat.juv_count,
		postjuv: stat.postjuv_count,
		adults: stat.adult_count,
		unknownAge: stat.unknown_age_count,
		newYoung: stat.new_young_count
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
