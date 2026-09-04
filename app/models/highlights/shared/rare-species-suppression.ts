import type { CountHighlight } from '@/app/models/highlights/counts/types';
import type { VitalStatHighlight } from '@/app/models/highlights/vital-stats/types';

// Cross-group extension point for #418: a rare-species highlight in Rarities
// may need to suppress that same species' own count/juv/weight lines in
// Counts/Vital-stats (previously Rem-3 in the old flat machine,
// removeCountAndWeightHighlightsForRareSpecies). #409 only defines the
// signal shape and the suppression logic below — nothing in this tree calls
// it yet, so it is currently unwired/no-op. #418 designs and wires the
// threading mechanism that gets a Rarities-derived signal to Counts/Vital-stats
// before their own combine steps run.
export type RareSpeciesSuppressionSignal = ReadonlySet<string>;

const SPECIES_COUNT_AND_WEIGHT_TYPES = [
	'species-count-record',
	'species-juv-count-record',
	'weight-record'
] as const;
type SpeciesCountOrWeightType = (typeof SPECIES_COUNT_AND_WEIGHT_TYPES)[number];

function isSpeciesCountOrWeightHighlight(
	highlight: CountHighlight | VitalStatHighlight
): highlight is Extract<
	CountHighlight | VitalStatHighlight,
	{ type: SpeciesCountOrWeightType }
> {
	return (SPECIES_COUNT_AND_WEIGHT_TYPES as readonly string[]).includes(
		highlight.type
	);
}

// For each rare-species name in the signal, drops that species' own count and
// weight highlights — the rare appearance is the headline for that bird, and a
// routine record alongside it only dilutes it. Other species' count/weight
// highlights, and session-wide records, are untouched. Not currently called
// anywhere — see the module comment above.
export function suppressCountAndWeightHighlightsForRareSpecies<
	T extends CountHighlight | VitalStatHighlight
>(highlights: T[], rareSpeciesNames: RareSpeciesSuppressionSignal): T[] {
	if (rareSpeciesNames.size === 0) return highlights;
	return highlights.filter(
		(highlight) =>
			!(
				isSpeciesCountOrWeightHighlight(highlight) &&
				rareSpeciesNames.has(highlight.speciesName)
			)
	);
}
