import type { SessionHighlight } from '@/app/models/session-highlights';

// Count/weight highlight types that a rare-species highlight suppresses. These
// are the "how many / how heavy" record lines — session totals, per-species
// counts, their juvenile counterparts, the busiest/quietest comparisons and the
// weight placements. Editorial rationale: when a genuinely rare bird turns up,
// that is the story of the session; the routine count and weight records read as
// noise beside it, so they are dropped. This rule runs before the combine pass,
// so it only ever sees these base types (their combined variants are produced
// later).
const COUNT_AND_WEIGHT_TYPES = [
	'session-total-record',
	'session-total-juv-record',
	'species-count-record',
	'species-juv-count-record',
	'since-comparison',
	'weight-record'
] as const;
type CountOrWeightType = (typeof COUNT_AND_WEIGHT_TYPES)[number];

function isCountOrWeightHighlight(
	highlight: SessionHighlight
): highlight is Extract<SessionHighlight, { type: CountOrWeightType }> {
	return (COUNT_AND_WEIGHT_TYPES as readonly string[]).includes(highlight.type);
}

// Rem-3: when the session has a rare-species highlight, drop every count and
// weight highlight — the rare bird is the headline, and the routine records
// alongside it only dilute it. No rare-species highlight leaves the pool
// untouched.
export function removeCountAndWeightHighlightsForRareSpecies(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const hasRareSpecies = highlights.some(
		(highlight) => highlight.type === 'rare-species'
	);
	if (!hasRareSpecies) return highlights;
	return highlights.filter((highlight) => !isCountOrWeightHighlight(highlight));
}
