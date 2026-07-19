import type { SessionHighlight } from '@/app/models/session-highlights';

// Per-species count/weight highlight types that a rare-species highlight
// suppresses for its own species. These are the "how many / how heavy" record
// lines scoped to a single species — its count record, the juvenile
// counterpart and its weight placement. Editorial rationale: when a genuinely
// rare bird turns up, that it appeared at all is the story; a routine count or
// weight record for the *same* species reads as noise beside it, so it is
// dropped. Session-wide records (session totals, busiest/quietest comparisons)
// are not tied to the rare species and are left untouched. This rule runs
// before the combine pass, so it only ever sees these base types (their
// combined variants are produced later).
const SPECIES_COUNT_AND_WEIGHT_TYPES = [
	'species-count-record',
	'species-juv-count-record',
	'weight-record'
] as const;
type SpeciesCountOrWeightType = (typeof SPECIES_COUNT_AND_WEIGHT_TYPES)[number];

function isSpeciesCountOrWeightHighlight(
	highlight: SessionHighlight
): highlight is Extract<SessionHighlight, { type: SpeciesCountOrWeightType }> {
	return (SPECIES_COUNT_AND_WEIGHT_TYPES as readonly string[]).includes(
		highlight.type
	);
}

// Rem-3: for each rare-species highlight, drop that species' own count and
// weight highlights — the rare appearance is the headline for that bird, and a
// routine record alongside it only dilutes it. Other species' count/weight
// highlights, and session-wide records, are untouched.
export function removeCountAndWeightHighlightsForRareSpecies(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const rareSpeciesNames = new Set(
		highlights
			.filter((highlight) => highlight.type === 'rare-species')
			.map((highlight) => highlight.speciesName)
	);
	if (rareSpeciesNames.size === 0) return highlights;
	return highlights.filter(
		(highlight) =>
			!(
				isSpeciesCountOrWeightHighlight(highlight) &&
				rareSpeciesNames.has(highlight.speciesName)
			)
	);
}
