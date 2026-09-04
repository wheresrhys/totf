import type { RecordScope } from '@/app/models/highlights/shared/record-scope';

export const SESSION_TOTAL_METRICS = ['encounters', 'species'] as const;
export type SessionTotalMetric = (typeof SESSION_TOTAL_METRICS)[number];

export type SessionTotalRecordHighlight = {
	type: 'session-total-record';
	metric: SessionTotalMetric;
	scope: RecordScope;
	value: number;
	year: number;
	// 'this year' copy is only correct while the session's year is still current;
	// otherwise the sentence uses the absolute year
	isCurrentYear: boolean;
	// Set only for all-time ties where the equalled record is over a year old
	recordEqualledYearsAgo?: number;
};

// The session's total juvenile count across all species, ranked against every
// other day in scope — the juvenile counterpart to a session-total record.
// Strict record or (all-time only) a tie that has stood for a year or more.
export type SessionTotalJuvRecordHighlight = {
	type: 'session-total-juv-record';
	scope: RecordScope;
	value: number;
	year: number;
	isCurrentYear: boolean;
	recordEqualledYearsAgo?: number;
};

export type SpeciesCountRecordHighlight = {
	type: 'species-count-record';
	speciesName: string;
	scope: RecordScope;
	value: number;
	year: number;
	isCurrentYear: boolean;
	recordEqualledYearsAgo?: number;
	// Set only for all-time placements: 1 for a tie with the current record
	// under a year old, 2/3 for days ranking behind the record
	placementRank?: 1 | 2 | 3;
	// True when a prior day matches the session's count exactly
	isJointPlacement?: boolean;
};

// The most juveniles of one species this session, ranked against every other
// day in scope — the juvenile counterpart to a species-count record, sharing
// the same 1st/2nd/3rd placement logic. Only produced when the session's juv
// count for the species exceeds MIN_NOTABLE_JUV_COUNT.
export type SpeciesJuvCountRecordHighlight = {
	type: 'species-juv-count-record';
	speciesName: string;
	scope: RecordScope;
	value: number;
	year: number;
	isCurrentYear: boolean;
	recordEqualledYearsAgo?: number;
	placementRank?: 1 | 2 | 3;
	isJointPlacement?: boolean;
};

// A busiest/quietest comparison against the most recent prior session day
// that equalled or exceeded (busiest) / equalled or undershot (quietest) the
// session's encounter total — "Busiest session since 12 May 2023"
export const SINCE_COMPARISON_KINDS = ['busiest', 'quietest'] as const;
export type SinceComparisonKind = (typeof SINCE_COMPARISON_KINDS)[number];

export type SinceComparisonHighlight = {
	type: 'since-comparison';
	kind: SinceComparisonKind;
	// The session's encounter total
	value: number;
	// ISO date of the most recent prior session day that matched the
	// comparison (undefined for a quietest-ever highlight — no prior day
	// undershot or matched the session)
	sinceDate?: string;
};

// A combined session-total record: a session that holds both the busiest
// (encounters) and most-varied (species) record over the *same* scope, merged
// by the combine pass into one "Busiest and most varied session" line. Carries
// the value for each metric plus the shared period fields.
export type CombinedSessionTotalRecordHighlight = {
	type: 'combined-session-total-record';
	scope: RecordScope;
	encounterValue: number;
	speciesValue: number;
	year: number;
	isCurrentYear: boolean;
};

// Multiple "Record day for <species> — N caught, the most this year"
// highlights (all this-year scope) merged by the combine pass into one
// "Highest A, B and C counts of the year" line. Drops the per-species count;
// keeps the shared year fields so the renderer can phrase the scope. The
// all-time scope never merges — its copy is per-species (placements, "the
// most ever").
export type CombinedSpeciesCountRecordHighlight = {
	type: 'combined-species-count-record';
	// Only the this-year scope carries combinable per-species copy
	scope: 'this-year';
	// Species names in the order the source highlights appeared
	speciesNames: string[];
	year: number;
	isCurrentYear: boolean;
};

// Multiple all-time 2nd- or 3rd-best-day species-count records that share a
// placement rank, merged by the combine pass into one line listing every
// species — "Second best day for Dunnock and Whitethroat ever". Only the
// all-time placements merge (this-year records combine separately); 1st places
// and record-equalling ties are never included. A combined line never carries a
// count (the merged species may differ on it) — the per-species count survives
// only on a single, unmerged placement. An all-joint group leads with "Joint",
// while a mixed group leads plain and flags each joint species inline ("(tied
// second) Whitethroat").
export type CombinedSpeciesPlacementRecordHighlight = {
	type: 'combined-species-placement-record';
	// The shared placement rank of every merged species (2nd or 3rd best)
	placementRank: 2 | 3;
	// Each merged species with its own joint flag, in the order the source
	// highlights appeared
	species: { name: string; isJoint: boolean }[];
};

// The discriminated union for the Counts group — session-total (busiest/most
// varied), per-species count, juvenile counterparts, and busiest/quietest-since
// comparisons, plus their combined multi-species variants.
export type CountHighlight =
	| SessionTotalRecordHighlight
	| SessionTotalJuvRecordHighlight
	| SpeciesCountRecordHighlight
	| SpeciesJuvCountRecordHighlight
	| SinceComparisonHighlight
	| CombinedSessionTotalRecordHighlight
	| CombinedSpeciesCountRecordHighlight
	| CombinedSpeciesPlacementRecordHighlight;
