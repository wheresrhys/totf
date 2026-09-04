import type { RecordScope } from '@/app/models/highlights/shared/record-scope';

// Which end of the weight range the placement concerns this session
export const WEIGHT_RECORD_EXTREMES = ['heaviest', 'lightest'] as const;
export type WeightRecordExtreme = (typeof WEIGHT_RECORD_EXTREMES)[number];

export type WeightRecordHighlight = {
	type: 'weight-record';
	speciesName: string;
	// The scope the placement is ranked over. All-time reports the top three
	// placements; this-year reports only a first place (see deriveWeightRecordBreakers).
	scope: RecordScope;
	extreme: WeightRecordExtreme;
	// The session's weight for this extreme, in grams
	weight: number;
	// Where the session's weight ranks across every day in scope the species was
	// weighed (1 = heaviest/lightest, capped at the top 3; always 1 for this-year)
	placementRank: 1 | 2 | 3;
	// True when another day's extreme exactly matches the session's weight
	isJointPlacement: boolean;
	// The session's calendar year — used by the this-year copy. 'this year' copy
	// is only correct while the session's year is still current; otherwise the
	// sentence uses the absolute year. Carried (but unused) for all-time.
	year: number;
	isCurrentYear: boolean;
};

// A this-year weight record (always a 1st place) merged with the same species'
// all-time placement for the *same* extreme, when that all-time placement is a
// 2nd/3rd (a lesser record that the year headline sits on top of). Rendered as a
// single line: the this-year claim as the headline, the all-time placement in
// parentheses — "Heaviest Blue Tit weighed in 2024 (2nd heaviest ever) — 13.1g".
// The two source highlights share one session bird, so a single weight applies.
// An all-time *1st* is never merged this way — being the heaviest ever subsumes
// the year claim, so that case keeps the plain all-time line instead.
export type CombinedWeightRecordHighlight = {
	type: 'combined-weight-record';
	speciesName: string;
	extreme: WeightRecordExtreme;
	// The shared session weight, in grams
	weight: number;
	year: number;
	// 'this year' copy is only correct while the session's year is still current;
	// otherwise the sentence uses the absolute year
	isCurrentYear: boolean;
	// True when another day this year ties the session's extreme (joint 1st)
	thisYearIsJoint: boolean;
	// The all-time placement folded into the parenthetical — always 2nd or 3rd
	allTimeRank: 2 | 3;
	// True when another day ever ties the session's extreme at that placement
	allTimeIsJoint: boolean;
};

// The discriminated union for the Vital-stats group — heaviest/lightest weight
// placements and their this-year/all-time combined variant.
export type VitalStatHighlight =
	| WeightRecordHighlight
	| CombinedWeightRecordHighlight;
