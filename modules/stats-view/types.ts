// Types shared across more than one file in this module. Owned here per root
// CLAUDE.md's "Module conventions" — before #1327 each of these lived in the
// helper file that happened to derive it and was imported file-to-file from
// there, rather than from one owned location.
//
// `StatsCacheBySpeciesResult` is *not* here: `modules/stats` owns it, so every
// file that needs it imports it directly from `@/modules/stats/browser` rather
// than through this module.

import type { StatsCacheBySpeciesResult } from '@/modules/stats/browser';

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
	speciesCount: number;
	encounterCount: number;
	maxPerSession: number;
	individualsCount: number;
	new: number;
	retraps: number;
	pullus: number;
	juvs: number;
	postjuv: number;
	adults: number;
	unknownAge: number;
};

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

// A column of one whole by-species cache row — counts or wing/weight metric
// alike. A species with no biometric-eligible encounters carries a real `null`
// in the 8 wing/weight columns, which `MultiSpeciesTableBody`'s generic
// `<td>{species[column.property]}</td>` renders as a blank cell — no
// special-casing needed.
export type SpeciesStatConfig = {
	label: string;
	property: keyof StatsCacheBySpeciesResult;
	suffix?: string;
	category?: string;
	prefix?: string;
	preferSortAscending?: boolean;
};
