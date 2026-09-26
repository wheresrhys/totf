import type { HighlightsGenerator, YearMonthRestriction } from '../types';
import type { CoreStatsResult } from '@/app/models/db';
import type { StatsRepository } from '@/app/actions/stats-cache';
import {
	sentenceCase,
	printTimeQualifier,
	printSpeciesForCount
} from '../lib/printer-utils';
import { getFirstAppearance } from '../lib/rule-utils';

type CoreStatsRepository = StatsRepository<CoreStatsResult>;

// "First Robin ever" / "First Robins of 2020" — the period in which a species was
// first recorded, read at whatever scope the machine is asking about. The species
// name carries the count: plural when the period held more than one bird.
//
// One rule covers both readings, which is the whole reason this migrated cleanly
// from v1's two separate derive functions (deriveFirstEverSpecies and
// deriveFirstOfYearSpecies): "first ever" and "first of the year" are the same
// fact through a wider and a narrower window, so the generic machinery in
// lib/time-period-highlights.ts does for free what v1 hand-rolled.
// removeLessSignificantHighlights drops the of-year line whenever the same
// species' first-ever line lands on the same period — a first-ever record is
// necessarily also that year's first — which is exactly what v1's
// "exclude species with no prior records" filter was for.
//
// One v1 behaviour is deliberately not reproduced: v1 kept a year's opening
// session as the spring-arrival roll-call, where every returning species is
// genuinely a first of that year, and folded the resulting pile into a single
// "First A, B and C records of the year" line. That fold is cross-species and so
// inexpressible here (see combineSimilarHighlights' header), and what's left
// without it is one line per species on one session a year. So
// suppressInEarliestPeriod applies at every scope instead: the earliest period of
// a window is where everything trivially looks like a first, whether that's the
// group's first-ever session (v1 suppressed this too, for the same reason) or the
// first session of a year.
export const firstSpeciesRecord: HighlightsGenerator = {
	statsSelector: (stats: CoreStatsRepository) => stats.bySpecies,
	formatters: {
		// Only scopes[0] is read. Unlike a count metric, where each extra scope
		// adds information ("busiest ever AND busiest of 2020"), every extra scope
		// on a first record merely restates the broadest one: a species' first
		// record ever is necessarily also its first of that year. scopes[0] is the
		// broadest (see sortByPositionAndTimeWindow), so it is the one to print.
		combinedHighlightPrinter: (combinedHighlight) => {
			const [{ scope }] = combinedHighlight.scopes;
			return sentenceCase(
				`First ${printSpeciesForCount(combinedHighlight.species, combinedHighlight.value.value)} ${printTimeQualifier(scope.parentTimeWindow)}`.trim()
			);
		},
		highlightListPrefixPrinter: (highlightsOfType) =>
			`First ${highlightsOfType.scope.species} ${printTimeQualifier(highlightsOfType.scope.parentTimeWindow)}`
	},
	descriptor: {
		type: 'firstSpeciesRecord',
		// The value carried is the cell's encounter count, which only ever gets
		// read as the singular/plural switch on the species name above.
		unit: 'encounter',
		category: 'rarity'
	},
	generator: getFirstAppearance({ suppressInEarliestPeriod: true }),
	// A month-only window asks "of any February", which has no coherent reading
	// as a first record — the earliest February a species appeared in is not a
	// first of anything.
	condition: (_temporalUnit, parentTimeWindow?: YearMonthRestriction) =>
		!parentTimeWindow?.month
};
