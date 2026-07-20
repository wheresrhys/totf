import {
	SCOPE_BREADTH_RANK,
	type SessionHighlight
} from '@/app/models/session-highlights';

// The per-species record families this rule dedups by scope. Each is keyed
// independently, so a species holding both an encounter record and a juvenile
// record keeps the broadest of each — they aren't collapsed into one another.
// Weight records are handled separately (combineWeightRecords): a this-year
// weight is merged with its all-time placement rather than dropped, so it is
// deliberately not deduped here.
const SCOPED_SPECIES_RECORD_TYPES = [
	'species-count-record',
	'species-juv-count-record'
] as const;
type ScopedSpeciesRecordType = (typeof SCOPED_SPECIES_RECORD_TYPES)[number];

function isScopedSpeciesRecord(
	highlight: SessionHighlight
): highlight is Extract<SessionHighlight, { type: ScopedSpeciesRecordType }> {
	return (SCOPED_SPECIES_RECORD_TYPES as readonly string[]).includes(
		highlight.type
	);
}

// Rem-2: when one species holds records at more than one scope, keep only the
// broadest — a narrower-scope record is subsumed by the broader one (e.g. drop
// "the most this year" when the same species holds a 2nd-best-ever placement).
// Applied per record family (encounter counts, juvenile counts): a species can
// still hold one of each.
export function removeNarrowerScopeSpeciesRecords(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	// Keyed by "<type>|<species>" so each family is deduped independently
	const broadestScopeRankByKey = new Map<string, number>();
	const keyFor = (
		highlight: Extract<SessionHighlight, { type: ScopedSpeciesRecordType }>
	) => `${highlight.type}|${highlight.speciesName}`;
	for (const highlight of highlights) {
		if (!isScopedSpeciesRecord(highlight)) continue;
		const rank = SCOPE_BREADTH_RANK.get(highlight.scope)!;
		const key = keyFor(highlight);
		const currentBroadest = broadestScopeRankByKey.get(key);
		if (currentBroadest === undefined || rank < currentBroadest) {
			broadestScopeRankByKey.set(key, rank);
		}
	}
	return highlights.filter((highlight) => {
		if (!isScopedSpeciesRecord(highlight)) return true;
		const broadestRank = broadestScopeRankByKey.get(keyFor(highlight))!;
		return SCOPE_BREADTH_RANK.get(highlight.scope)! === broadestRank;
	});
}
