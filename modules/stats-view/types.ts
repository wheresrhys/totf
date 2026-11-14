// Types shared across more than one file in this module. Owned here per root
// CLAUDE.md's "Module conventions" — before #1327 each of these lived in the
// helper file that happened to derive it and was imported file-to-file from
// there, rather than from one owned location.
//
// `StatsCacheBySpeciesResult` is *not* here: `modules/stats` owns it, so every
// file that needs it imports it directly from `@/modules/stats/browser` rather
// than through this module.

import type {
	BiometricStatName,
	StatsCacheBySpeciesResult
} from '@/modules/stats/browser';

export type PeriodTotalsGrouping = 'year' | 'month' | 'day';

// Which class of stat a stats table's breakdown block is currently showing —
// the age-bucket counts or the wing/weight biometrics. The named alternatives
// rather than a `showBiometrics` boolean: every function that branches on it
// reads as a comparison against a stat class, and a third class could be added
// without rewriting the call sites (#1431 review).
export type StatsClass = 'counts' | 'biometrics';

// The 8 wing/weight stats `lib/session-species-biometrics.ts` derives
// client-side from a session's raw encounters (#1431), keyed by the same
// canonical `BiometricStatName`s the cached columns use so one
// `buildBiometricColumnConfigs()` config set addresses either source. `null`
// is the genuine "nothing measured" value for a stat, never zero — see that
// file.
export type SessionSpeciesBiometrics = Record<BiometricStatName, number | null>;

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

// The 8 `BiometricStatName` fields are intersected on rather than listed by
// hand, so they can never drift from the canonical field list — same
// `buildBiometricColumnConfigs` reduces over to build the Counts/Biometrics
// toggle's biometrics-mode columns (#1430). Both derivers read them straight
// off the input `StatsCacheBySpeciesResult` row with no bird/encounter
// aggregation distinction, since the cache row doesn't distinguish them
// either.
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
} & Record<BiometricStatName, number | null>;

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
