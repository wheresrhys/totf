export type FirstEverSpeciesHighlight = {
	type: 'first-ever-species';
	speciesName: string;
	// More than one encounter of the species this session — 'record' vs 'records'
	multipleIndividualsRecorded: boolean;
	// The session holds the species' only records ever (no other day in the
	// data, before or after) — 'Only' copy instead of 'First'
	isOnlyRecord: boolean;
};

export type FirstOfYearSpeciesHighlight = {
	type: 'first-of-year-species';
	speciesName: string;
	year: number;
	// 'of the year' copy is only correct while the session's year is current;
	// otherwise the sentence uses the absolute year
	isCurrentYear: boolean;
	// More than one encounter of the species this session — 'record' vs 'records'
	multipleIndividualsRecorded: boolean;
	// The session holds the species' only records this calendar year (no other
	// day in the year, before or after) — 'Only' copy instead of 'First'
	isOnlyRecord: boolean;
};

export type RareSpeciesHighlight = {
	type: 'rare-species';
	speciesName: string;
	// Distinct session days the species has ever been recorded on (2–3 here;
	// a count of 1 is a first-ever appearance, handled elsewhere)
	totalSessionDays: number;
};

// A "MEGA" highlight: a first/only record — of the year or ever — for a species
// the group has only ever recorded on a handful of session days. Produced by
// this group's combine pass (combineFirstRareHighlights) when a first/only
// highlight and a rare-species highlight for the *same* species coincide,
// folding both into one headline line. The first/only line supplies the
// headline; the rarity rides in a parenthetical, except for an "only ... ever"
// record, which already implies maximal rarity and so carries none. Runs before
// the other combine rules so the specific first/only line is consumed here
// rather than merged into a multi-species "First/Only A, B and C" line.
export type MegaSpeciesHighlight = {
	type: 'mega-species';
	// The first/only highlight this MEGA is built on — its species also holds
	// the rare-species highlight folded in as totalSessionDays. Its type
	// discriminates the of-year vs ever headline phrasing.
	base: FirstEverSpeciesHighlight | FirstOfYearSpeciesHighlight;
	// Distinct session days the species has ever been recorded on, carried over
	// from the rare-species highlight absorbed into this line (2–3 in practice)
	totalSessionDays: number;
};

// Multiple "Only <species> records of the year" highlights merged by the
// combine pass into one line listing every species. Always the only-of-year
// variant (isOnlyRecord) — first-of-year items are never merged this way.
export type CombinedOnlyOfYearHighlight = {
	type: 'combined-only-of-year';
	// Species names in the order the source highlights appeared
	speciesNames: string[];
	year: number;
	isCurrentYear: boolean;
};

// Multiple "First ever <species> record(s)" highlights merged by the combine
// pass into one "First ever A, B and C records" line. Only the "First ever"
// variant merges — "Only <species> records ever" (isOnlyRecord) items are left
// per-species. A combined line always covers at least two species, so the copy
// is always plural ("records") even if every part was singular.
export type CombinedFirstEverHighlight = {
	type: 'combined-first-ever';
	// Species names in the order the source highlights appeared
	speciesNames: string[];
};

// Multiple "First <species> record(s) of the year" highlights merged by the
// combine pass into one "First A, B and C records of the year" line. Only the
// "First of year" variant merges — the "Only ... of the year" (isOnlyRecord)
// items combine separately (CombinedOnlyOfYearHighlight). As with first-ever,
// the combined copy is always plural.
export type CombinedFirstOfYearHighlight = {
	type: 'combined-first-of-year';
	// Species names in the order the source highlights appeared
	speciesNames: string[];
	year: number;
	isCurrentYear: boolean;
};

// The discriminated union for the Rarities group — first-ever/first-of-year
// appearances, rare species, the MEGA badge that folds them together, and
// their combined multi-species variants.
export type RarityHighlight =
	| FirstEverSpeciesHighlight
	| FirstOfYearSpeciesHighlight
	| RareSpeciesHighlight
	| MegaSpeciesHighlight
	| CombinedOnlyOfYearHighlight
	| CombinedFirstEverHighlight
	| CombinedFirstOfYearHighlight;
