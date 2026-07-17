import {
	RECORD_SCOPES,
	type CombinedOnlyOfYearHighlight,
	type CombinedSessionTotalRecordHighlight,
	type FirstOfYearSpeciesHighlight,
	type SessionHighlight,
	type SessionTotalRecordHighlight
} from '@/app/models/session-highlights';

// ---- Pass 1 — removal (#360 Rem-1, Rem-2) ----

// Rem-1: a "Busiest session since <date>" comparison is redundant once the
// session already holds a busiest (encounters) session-total record — the
// record is the stronger, more specific claim.
function removeBusiestSinceWhenBusiestRecordHeld(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const holdsBusiestRecord = highlights.some(
		(highlight) =>
			highlight.type === 'session-total-record' &&
			highlight.metric === 'encounters'
	);
	if (!holdsBusiestRecord) return highlights;
	return highlights.filter(
		(highlight) =>
			!(highlight.type === 'since-comparison' && highlight.kind === 'busiest')
	);
}

const SCOPE_BREADTH_RANK = new Map(
	RECORD_SCOPES.map((scope, index) => [scope, index])
);

// Rem-2: when one species holds records at more than one scope, keep only the
// broadest — a narrower-scope record is subsumed by the broader one (e.g. drop
// "the most this year" when the same species holds a 2nd-best-ever placement).
function removeNarrowerScopeSpeciesRecords(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const broadestScopeRankBySpecies = new Map<string, number>();
	for (const highlight of highlights) {
		if (highlight.type !== 'species-count-record') continue;
		const rank = SCOPE_BREADTH_RANK.get(highlight.scope)!;
		const currentBroadest = broadestScopeRankBySpecies.get(
			highlight.speciesName
		);
		if (currentBroadest === undefined || rank < currentBroadest) {
			broadestScopeRankBySpecies.set(highlight.speciesName, rank);
		}
	}
	return highlights.filter((highlight) => {
		if (highlight.type !== 'species-count-record') return true;
		const broadestRank = broadestScopeRankBySpecies.get(highlight.speciesName)!;
		return SCOPE_BREADTH_RANK.get(highlight.scope)! === broadestRank;
	});
}

export function removeRedundantHighlights(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return removeNarrowerScopeSpeciesRecords(
		removeBusiestSinceWhenBusiestRecordHeld(highlights)
	);
}

// ---- Pass 2 — ordering (#360 Ord-1) ----

// The scoped record block sorts strictly by scope breadth (all-time first),
// interleaving session-total and species-count records. Everything else keeps
// its former relative order: the quietest-since comparison, then the
// first/rare/long-absence block, then weights last.
const SCOPED_RECORD_TYPES = new Set<SessionHighlight['type']>([
	'session-total-record',
	'combined-session-total-record',
	'species-count-record'
]);

// Order of the non-scoped highlight families that follow the record block
const TRAILING_TYPE_ORDER: SessionHighlight['type'][] = [
	'since-comparison',
	'first-ever-species',
	'first-of-year-species',
	'combined-only-of-year',
	'rare-species',
	'long-absence-retrap',
	'weight-record'
];

function scopeOf(highlight: SessionHighlight): number {
	if ('scope' in highlight) return SCOPE_BREADTH_RANK.get(highlight.scope)!;
	return 0;
}

// Within one scope a session-total record (or its combined form) leads its
// species-count records — so a "Busiest and most varied session" line heads the
// scope's block rather than trailing the individual species records.
const SESSION_TOTAL_TYPES = new Set<SessionHighlight['type']>([
	'session-total-record',
	'combined-session-total-record'
]);

// Sort key [group, scope, withinScope]: scoped records form the first group
// (sub-ordered by scope, then session-totals before species records); each
// trailing family follows in a fixed order. A stable sort preserves generation
// order within any group sharing a key.
function orderingKey(highlight: SessionHighlight): [number, number, number] {
	if (SCOPED_RECORD_TYPES.has(highlight.type)) {
		return [
			0,
			scopeOf(highlight),
			SESSION_TOTAL_TYPES.has(highlight.type) ? 0 : 1
		];
	}
	return [1 + TRAILING_TYPE_ORDER.indexOf(highlight.type), 0, 0];
}

export function orderByScope(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return [...highlights].sort((a, b) => {
		const [groupA, scopeA, withinA] = orderingKey(a);
		const [groupB, scopeB, withinB] = orderingKey(b);
		return groupA - groupB || scopeA - scopeB || withinA - withinB;
	});
}

// ---- Pass 3 — combining (#360 Comb-1, Comb-2) ----

// Comb-1: a session holding both the busiest (encounters) and most-varied
// (species) session-total record over the *same* scope has them merged into one
// "Busiest and most varied session" line. Different scopes stay separate. The
// combined item takes the list position of the encounters record.
function combineSessionTotalRecords(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const recordsByScope = new Map<
		string,
		{
			encounters?: SessionTotalRecordHighlight;
			species?: SessionTotalRecordHighlight;
		}
	>();
	for (const highlight of highlights) {
		if (highlight.type !== 'session-total-record') continue;
		const forScope = recordsByScope.get(highlight.scope) ?? {};
		forScope[highlight.metric] = highlight;
		recordsByScope.set(highlight.scope, forScope);
	}
	// Scopes holding both a busiest and a most-varied record — the pair merges
	const combinableScopes = new Set(
		[...recordsByScope]
			.filter(([, pair]) => pair.encounters && pair.species)
			.map(([scope]) => scope)
	);
	const result: SessionHighlight[] = [];
	for (const highlight of highlights) {
		if (
			highlight.type === 'session-total-record' &&
			combinableScopes.has(highlight.scope)
		) {
			// Emit the combined item in place of the busiest record; drop the
			// most-varied record wherever it sits
			if (highlight.metric === 'species') continue;
			const species = recordsByScope.get(highlight.scope)!.species!;
			const combined: CombinedSessionTotalRecordHighlight = {
				type: 'combined-session-total-record',
				scope: highlight.scope,
				encounterValue: highlight.value,
				speciesValue: species.value,
				seasonName: highlight.seasonName,
				year: highlight.year,
				isCurrentYear: highlight.isCurrentYear,
				isCurrentSeason: highlight.isCurrentSeason,
				seasonPeriodLabel: highlight.seasonPeriodLabel
			};
			result.push(combined);
			continue;
		}
		result.push(highlight);
	}
	return result;
}

// Comb-2: multiple "Only <species> records of the year" highlights merge into a
// single line listing every species. One only-of-year highlight is left as-is;
// first-of-year (non-only) highlights are never merged. The combined item takes
// the position of the first only-of-year highlight.
function isOnlyOfYear(
	highlight: SessionHighlight
): highlight is FirstOfYearSpeciesHighlight {
	return highlight.type === 'first-of-year-species' && highlight.isOnlyRecord;
}

function combineOnlyOfYearHighlights(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const onlyOfYear = highlights.filter(isOnlyOfYear);
	if (onlyOfYear.length < 2) return highlights;
	const [first] = onlyOfYear;
	const combined: CombinedOnlyOfYearHighlight = {
		type: 'combined-only-of-year',
		speciesNames: onlyOfYear.map((highlight) => highlight.speciesName),
		year: first.year,
		isCurrentYear: first.isCurrentYear
	};
	let combinedInserted = false;
	const result: SessionHighlight[] = [];
	for (const highlight of highlights) {
		if (isOnlyOfYear(highlight)) {
			if (!combinedInserted) {
				result.push(combined);
				combinedInserted = true;
			}
			continue;
		}
		result.push(highlight);
	}
	return result;
}

export function combineHighlights(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return combineOnlyOfYearHighlights(combineSessionTotalRecords(highlights));
}

// The three-pass highlight machine: every editorial refinement to the derived
// highlight pool is expressed as a removal, ordering or combining rule in one
// of the passes (rewording is not a machine rule — it lives in a highlight's
// own renderer).
export function runHighlightMachine(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	return combineHighlights(orderByScope(removeRedundantHighlights(highlights)));
}
