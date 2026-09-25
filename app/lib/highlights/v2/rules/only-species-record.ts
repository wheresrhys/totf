import type { HighlightsGenerator, YearMonthRestriction } from '../types';
import type { CoreStatsResult } from '@/app/models/db';
import type { StatsRepository } from '@/app/actions/stats-cache';
import { sentenceCase, printTimeQualifier } from '../lib/printer-utils';
import { getSoleAppearance } from '../lib/rule-utils';

type CoreStatsRepository = StatsRepository<CoreStatsResult>;

// "Only Robin record ever" / "Only Robin records of 2020" — a species recorded in
// exactly one period of the scope being asked about. v1 carried this as an
// isOnlyRecord flag on its first-ever and first-of-year highlights; here it is
// its own metric, since a HighlightValue carries a number and a period and has
// nowhere to put a boolean.
//
// Read first-species-record.ts's header: the same window-widening argument,
// the same scope suppression and the same lost cross-species fold (v1's
// combineOnlyOfYearHighlights) all apply here.
//
// It stays mutually exclusive with firstSpeciesRecord by construction —
// getSoleAppearance fires on exactly one appearance, getFirstAppearance on two
// or more — so a cell never prints both sentences about the same window. What
// being a separate descriptor does cost, and v1 avoided: nothing clobbers across
// descriptor types, so a species whose first-ever record is also its only record
// of that year prints both lines ("First Robin record ever" and "Only Robin
// record of 2024"). That is the cross-type folding the generic combiner can't
// do (again, see combineSimilarHighlights' header).
export const onlySpeciesRecord: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.bySpecies,
	formatters: {
		// scopes[0] only, for the same reason as firstSpeciesRecord: a species'
		// only record ever is necessarily also its only record of that year.
		combinedHighlightPrinter: (combinedHighlight) => {
			const [{ scope }] = combinedHighlight.scopes;
			return sentenceCase(
				`Only ${combinedHighlight.species} record${combinedHighlight.value.value > 1 ? 's' : ''} ${printTimeQualifier(scope.parentTimeWindow)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`Only ${highlightsOfType.scope.species} record ${printTimeQualifier(highlightsOfType.scope.parentTimeWindow)}`
	},
	descriptor: {
		type: 'onlySpeciesRecord',
		unit: 'encounter',
		category: 'rarity'
	},
	generator: getSoleAppearance({ suppressInEarliestPeriod: true }),
	condition: (_temporalUnit, parentTimeWindow?: YearMonthRestriction) =>
		!parentTimeWindow?.month
};
