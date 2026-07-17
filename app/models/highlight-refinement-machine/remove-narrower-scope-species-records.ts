import type { SessionHighlight } from '@/app/models/session-highlights';
import { SCOPE_BREADTH_RANK } from './scope-breadth';

// Rem-2: when one species holds records at more than one scope, keep only the
// broadest — a narrower-scope record is subsumed by the broader one (e.g. drop
// "the most this year" when the same species holds a 2nd-best-ever placement).
export function removeNarrowerScopeSpeciesRecords(
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
