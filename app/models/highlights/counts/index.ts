import { SCOPE_BREADTH_RANK } from '@/app/models/highlights/shared/record-scope';
import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import { deriveSessionTotalRecords } from './derive-session-total';
import { deriveSessionTotalJuvRecords } from './derive-session-total-juv';
import { deriveSinceHighlights } from './derive-since-comparison';
import { deriveSpeciesRecords } from './derive-species-count';
import { deriveSpeciesJuvRecords } from './derive-species-juv-count';
import { removeBusiestSinceWhenBusiestRecordHeld } from './rules/remove-busiest-since-when-busiest-record-held';
import { removeNarrowerScopeSpeciesRecords } from './rules/remove-narrower-scope-species-records';
import { combineSessionTotalRecords } from './rules/combine-session-total-records';
import { combineYearSpeciesCounts } from './rules/combine-year-species-counts';
import { combineSpeciesPlacementRecords } from './rules/combine-species-placement-records';
import type { CountHighlight } from './types';

export {
	buildDayTotals,
	deriveSessionTotalRecords
} from './derive-session-total';
export { deriveSessionTotalJuvRecords } from './derive-session-total-juv';
export { deriveSinceHighlights } from './derive-since-comparison';
export {
	deriveAllTimePlacement,
	deriveSpeciesRecords
} from './derive-species-count';
export {
	deriveSpeciesJuvRecords,
	MIN_NOTABLE_JUV_COUNT
} from './derive-species-juv-count';
export { removeBusiestSinceWhenBusiestRecordHeld } from './rules/remove-busiest-since-when-busiest-record-held';
export { removeNarrowerScopeSpeciesRecords } from './rules/remove-narrower-scope-species-records';
export { combineSessionTotalRecords } from './rules/combine-session-total-records';
export { combineYearSpeciesCounts } from './rules/combine-year-species-counts';
export { combineSpeciesPlacementRecords } from './rules/combine-species-placement-records';
export * from './types';

// Applied in the same relative order the old flat machine ran them in.
const RULES: ((highlights: CountHighlight[]) => CountHighlight[])[] = [
	removeBusiestSinceWhenBusiestRecordHeld,
	removeNarrowerScopeSpeciesRecords,
	combineSessionTotalRecords,
	combineYearSpeciesCounts,
	combineSpeciesPlacementRecords
];

// sessionMagnitudeBlock's local order key: encounters (busiest)/combined
// outrank species (most-varied) at the same scope, then all-time outranks
// this-year — this exactly reproduces the old scored family order, where a
// session-total record's score was dominated by its conceptual weight
// (encounters=3, species=2) before its temporal breadth (all-time=2,
// this-year=1): e.g. this-year-encounters (old score 4.03) beat
// all-time-species (4.02).
function sessionMagnitudeRank(highlight: CountHighlight): number {
	const scopeRank = SCOPE_BREADTH_RANK.get(
		highlight.type === 'session-total-record' ||
			highlight.type === 'combined-session-total-record'
			? highlight.scope
			: 'all-time'
	)!;
	const isSpeciesOnly =
		highlight.type === 'session-total-record' && highlight.metric === 'species';
	return (isSpeciesOnly ? 1 : 0) * 10 + scopeRank;
}

// speciesCountBlock/juvBlock's local order key (approved as a deliberate,
// documented deviation from old behaviour — see PR description): scope
// breadth (all-time before this-year), then placement rank ascending (a
// strict record/record-equalling tie, or a highlight with no placement
// concept at all, sorts as rank 0, ahead of a 2nd/3rd placement). The old
// flat machine gave every species-count record at a given scope the same
// score regardless of placement, so same-scope, different-placement
// highlights fell back to generation order instead.
function scopedPlacementRank(highlight: CountHighlight): number {
	switch (highlight.type) {
		case 'species-count-record':
		case 'species-juv-count-record':
			return (
				SCOPE_BREADTH_RANK.get(highlight.scope)! * 10 +
				(highlight.placementRank ?? 0)
			);
		case 'session-total-juv-record':
			return SCOPE_BREADTH_RANK.get(highlight.scope)! * 10;
		case 'combined-species-count-record':
			// This-year, always the best-ish tier (uncombined this-year records
			// are all strict-or-equalling records — see combineYearSpeciesCounts)
			return SCOPE_BREADTH_RANK.get('this-year')! * 10;
		case 'combined-species-placement-record':
			// All-time, its own shared placementRank
			return SCOPE_BREADTH_RANK.get('all-time')! * 10 + highlight.placementRank;
		default:
			return 0;
	}
}

function juvKindRank(highlight: CountHighlight): number {
	return highlight.type === 'session-total-juv-record' ? 0 : 1;
}

// Runs the Counts group's derive -> rules pipeline, then composes the final
// ordered list as a literal concatenation of kind-blocks — no computed
// priority number, no global order rule shared with the other groups.
//
// [sessionMagnitudeBlock, speciesCountBlock, juvBlock, sinceBlock]: this order
// reproduces the old flat machine's cross-family order exactly — every
// session-total score there (min 3.02) always outranked every species-count
// score (max 3.01), and both families' scores always outranked the juv
// families' and since-comparison's. Within each block, the local order keys
// above are documented, deliberate refinements over "generation order" (see
// each key's comment and the PR description) rather than a straight port —
// the finer-grained editorial composition for this group is the follow-on
// tickets #411-#413/#416's job.
export function runCountsGroup({
	date,
	stats,
	today = new Date()
}: {
	date: string;
	stats: SessionStatsData;
	today?: Date;
}): CountHighlight[] {
	const pool: CountHighlight[] = [
		...deriveSessionTotalRecords({ date, stats, today }),
		...deriveSessionTotalJuvRecords({ date, stats, today }),
		...deriveSinceHighlights({ date, stats }),
		...deriveSpeciesRecords({ date, stats, today }),
		...deriveSpeciesJuvRecords({ date, stats, today })
	];
	const afterRules = RULES.reduce((current, rule) => rule(current), pool);

	const sessionMagnitudeBlock = afterRules
		.filter(
			(highlight) =>
				highlight.type === 'session-total-record' ||
				highlight.type === 'combined-session-total-record'
		)
		.sort((a, b) => sessionMagnitudeRank(a) - sessionMagnitudeRank(b));
	const speciesCountBlock = afterRules
		.filter(
			(highlight) =>
				highlight.type === 'species-count-record' ||
				highlight.type === 'combined-species-count-record' ||
				highlight.type === 'combined-species-placement-record'
		)
		.sort((a, b) => scopedPlacementRank(a) - scopedPlacementRank(b));
	const juvBlock = afterRules
		.filter(
			(highlight) =>
				highlight.type === 'session-total-juv-record' ||
				highlight.type === 'species-juv-count-record'
		)
		.sort((a, b) => {
			const kindDiff = juvKindRank(a) - juvKindRank(b);
			if (kindDiff !== 0) return kindDiff;
			return scopedPlacementRank(a) - scopedPlacementRank(b);
		});
	const sinceBlock = afterRules.filter(
		(highlight) => highlight.type === 'since-comparison'
	);

	return [
		...sessionMagnitudeBlock,
		...speciesCountBlock,
		...juvBlock,
		...sinceBlock
	];
}
