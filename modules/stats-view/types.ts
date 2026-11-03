// Types shared across more than one file in this module. Owned here per root
// CLAUDE.md's "Module conventions" — before #1327 each of these lived in the
// helper file that happened to derive it and was imported file-to-file from
// there (`species-totals.ts` reached into `species-stats.ts` for
// `SpeciesStatsRow`; every table component reached into both).
//
// `CoreStatsResult`/`BiometricsStatsResult`/`BiometricFieldName` are *not*
// here: `app/models/db.ts` owns them, so every file that needs one imports it
// directly from there rather than through this module.

import type {
	CoreStatsResult,
	BiometricFieldName,
	BiometricsStatsResult
} from '@/app/models/db';

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

// The /species list page's row shape (#823): every non-biometric column from
// core_stats, plus the 8 biometric columns sourced from a BiometricsStatsResult
// row. core_stats no longer carries its own copies (#827 removed them), so the
// biometrics row is the sole source. A species with no matching biometrics row
// leaves the 8 fields undefined, which
// MultiSpeciesTableBody's generic `<td>{species[column.property]}</td>` already
// renders as a blank cell — no special-casing needed.
export type SpeciesStatsRow = Omit<CoreStatsResult, BiometricFieldName> &
	Partial<Pick<BiometricsStatsResult, BiometricFieldName>>;

export type SpeciesStatConfig = {
	label: string;
	property: keyof SpeciesStatsRow;
	suffix?: string;
	category?: string;
	prefix?: string;
	preferSortAscending?: boolean;
};
