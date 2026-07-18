import {
	combinedSortValue,
	type CombinedSpeciesCountRecordHighlight,
	type SessionHighlight,
	type SpeciesCountRecordHighlight
} from '@/app/models/session-highlights';

// Scopes whose species-count records merge into one line — only the
// current-period scopes, whose copy is "the most this year/season" and so reads
// cleanly as a species list. All-time/any-season records stay per-species
// (placements, "the most ever") and are never merged.
const COMBINABLE_SCOPES = ['this-year', 'this-season'] as const;
type CombinableScope = (typeof COMBINABLE_SCOPES)[number];

function isCombinable(
	highlight: SessionHighlight
): highlight is SpeciesCountRecordHighlight & { scope: CombinableScope } {
	return (
		highlight.type === 'species-count-record' &&
		(COMBINABLE_SCOPES as readonly string[]).includes(highlight.scope)
	);
}

// Comb-3: multiple single-species "Record day for X — N caught, the most this
// year/season" highlights over the same scope merge into one "Highest A, B and
// C counts of the year" line, dropping the per-species count. Each scope merges
// independently; a scope with a lone record is left unchanged. The combined
// item takes the position of the first record for its scope.
export function combineYearAndSeasonSpeciesCounts(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const recordsByScope = new Map<
		CombinableScope,
		(SpeciesCountRecordHighlight & { scope: CombinableScope })[]
	>();
	for (const highlight of highlights) {
		if (!isCombinable(highlight)) continue;
		const forScope = recordsByScope.get(highlight.scope) ?? [];
		forScope.push(highlight);
		recordsByScope.set(highlight.scope, forScope);
	}
	// Only scopes holding at least two records combine
	const combiningScopes = new Set(
		[...recordsByScope]
			.filter(([, records]) => records.length >= 2)
			.map(([scope]) => scope)
	);
	if (combiningScopes.size === 0) return highlights;

	const insertedScopes = new Set<CombinableScope>();
	const result: SessionHighlight[] = [];
	for (const highlight of highlights) {
		if (isCombinable(highlight) && combiningScopes.has(highlight.scope)) {
			// Emit the combined line in place of the scope's first record; drop
			// every other record for that scope
			if (insertedScopes.has(highlight.scope)) continue;
			insertedScopes.add(highlight.scope);
			const records = recordsByScope.get(highlight.scope)!;
			const [first] = records;
			const combined: CombinedSpeciesCountRecordHighlight = {
				type: 'combined-species-count-record',
				sortValue: combinedSortValue(records),
				scope: highlight.scope,
				speciesNames: records.map((record) => record.speciesName),
				seasonName: first.seasonName,
				year: first.year,
				isCurrentYear: first.isCurrentYear,
				isCurrentSeason: first.isCurrentSeason,
				seasonPeriodLabel: first.seasonPeriodLabel
			};
			result.push(combined);
			continue;
		}
		result.push(highlight);
	}
	return result;
}
