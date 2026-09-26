import type { HighlightsGenerator, YearMonthRestriction } from '../types';
import type { CoreStatsResult } from '@/app/models/db';
import type { StatsRepository } from '@/app/actions/stats-cache';
import {
	printTemporalUnit,
	printTimeQualifier,
	printSpeciesForCount,
	sentenceCase
} from '../lib/printer-utils';
import { getInfrequentAppearances } from '../lib/rule-utils';

type CoreStatsRepository = StatsRepository<CoreStatsResult>;

// "Firecrests seen in only 2 sessions ever" — a species the group has only ever
// recorded in a handful of periods is worth a line every time it turns up again,
// and the count of those periods is the whole story.
//
// The species name agrees with that period count rather than with a number of
// birds, which is the one place this reads differently from the two record rules:
// the line is a statement about the species as a whole, and a rare species is by
// definition recorded in at least two periods, so in practice it always reads
// plural. (Only a fixture can produce the singular form.)
//
// All-time only. Unlike firstSpeciesRecord, rarity is not the same fact at a
// narrower scope: "appeared in only 2 months of 2020" is true of most species in
// most years and says nothing about how rare the bird is. The threshold only
// means anything against the group's full history, so a windowed scope is
// refused outright rather than gated behind a different threshold.
export const rareSpecies: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.bySpecies,
	formatters: {
		combinedHighlightPrinter: (combinedHighlight) => {
			const [{ scope }] = combinedHighlight.scopes;
			const appearances = combinedHighlight.value.value;
			return sentenceCase(
				`${printSpeciesForCount(combinedHighlight.species, appearances)} seen in only ${appearances} ${printTemporalUnit(scope.temporalUnit, appearances > 1)} ${printTimeQualifier(scope.parentTimeWindow)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`${printTemporalUnit(highlightsOfType.scope.temporalUnit, highlightsOfType.values.length > 1)} with a rare ${highlightsOfType.scope.species} appearance`
	},
	descriptor: {
		type: 'rareSpecies',
		// The value is a count of periods the species appeared in, which the
		// printer spells out with printTemporalUnit rather than through this unit.
		unit: 'session',
		category: 'rarity'
	},
	generator: getInfrequentAppearances(),
	condition: (_temporalUnit, parentTimeWindow?: YearMonthRestriction) =>
		!parentTimeWindow
};
