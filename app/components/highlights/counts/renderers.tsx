import type { ReactElement } from 'react';
import type {
	CombinedSessionTotalRecordHighlight,
	CombinedSpeciesCountRecordHighlight,
	CombinedSpeciesPlacementRecordHighlight,
	CountHighlight,
	RecordScope,
	SessionTotalMetric,
	SessionTotalRecordHighlight,
	SessionTotalJuvRecordHighlight,
	SinceComparisonHighlight,
	SinceComparisonKind,
	SpeciesCountRecordHighlight,
	SpeciesJuvCountRecordHighlight
} from '@/app/models/highlights';
import {
	buildOfYearPhrase,
	buildSpeciesList,
	capitalize,
	formatShortDate,
	renderSentence
} from '@/app/components/highlights/shared/render-sentence';

// ---- copy builders ----

type PeriodFields = {
	scope: RecordScope;
	year: number;
	isCurrentYear: boolean;
};

// Returns the scope-qualified phrase for the "this year" scope, whose copy
// changes depending on whether the year is still current. Handles the shared
// conditional logic for both session-total and species-record families. Returns
// null for all-time, which each family phrases differently.
// yearPreposition: 'in' for species-count ("the most in 2024"),
//                  'of' for session-total ("Busiest session of 2024")
function buildCurrentPeriodScopePhrase(
	fields: PeriodFields,
	yearPreposition: 'in' | 'of' = 'in'
): string | null {
	if (fields.scope !== 'this-year') return null;
	return fields.isCurrentYear
		? 'this year'
		: `${yearPreposition} ${fields.year}`;
}

const SESSION_TOTAL_METRIC_COPY: Record<
	SessionTotalMetric,
	{ descriptor: string; unit: string }
> = {
	encounters: { descriptor: 'Busiest', unit: 'birds' },
	species: { descriptor: 'Most varied', unit: 'species' }
};

function buildYearsAgoCopy(yearsAgo: number): string {
	return `${yearsAgo} ${yearsAgo === 1 ? 'year' : 'years'}`;
}

function buildSessionTotalRecordSentence(
	highlight: SessionTotalRecordHighlight
): string {
	const { descriptor, unit } = SESSION_TOTAL_METRIC_COPY[highlight.metric];
	const valueCopy = `${highlight.value} ${unit}`;
	if (highlight.recordEqualledYearsAgo !== undefined) {
		return `${descriptor} session for ${buildYearsAgoCopy(highlight.recordEqualledYearsAgo)} — ${valueCopy}`;
	}
	const currentPeriodPhrase = buildCurrentPeriodScopePhrase(highlight, 'of');
	if (currentPeriodPhrase !== null) {
		return `${descriptor} session ${currentPeriodPhrase} — ${valueCopy}`;
	}
	// Remaining case: all-time (this-year handled above)
	return `${descriptor} session ever — ${valueCopy}`;
}

// "Most juveniles ever — N juvs" / "Most juveniles this year — N juvs" /
// "Most juveniles for N years — N juvs". The session-total juvenile counterpart
// to buildSessionTotalRecordSentence, phrasing the scope the same way.
function buildSessionTotalJuvRecordSentence(
	highlight: SessionTotalJuvRecordHighlight
): string {
	const valueCopy = `${highlight.value} juvs`;
	if (highlight.recordEqualledYearsAgo !== undefined) {
		return `Most juveniles for ${buildYearsAgoCopy(highlight.recordEqualledYearsAgo)} — ${valueCopy}`;
	}
	const currentPeriodPhrase = buildCurrentPeriodScopePhrase(highlight, 'of');
	if (currentPeriodPhrase !== null) {
		return `Most juveniles ${currentPeriodPhrase} — ${valueCopy}`;
	}
	return `Most juveniles ever — ${valueCopy}`;
}

// "Busiest and most varied session <period> — N birds from M species".
// Shares the session-total period phrasing so the scope reads identically to
// the standalone busiest/most-varied lines it replaces.
function buildCombinedSessionTotalRecordSentence(
	highlight: CombinedSessionTotalRecordHighlight
): string {
	const valueCopy = `${highlight.encounterValue} birds from ${highlight.speciesValue} species`;
	const currentPeriodPhrase = buildCurrentPeriodScopePhrase(highlight, 'of');
	if (currentPeriodPhrase !== null) {
		return `Busiest and most varied session ${currentPeriodPhrase} — ${valueCopy}`;
	}
	return `Busiest and most varied session ever — ${valueCopy}`;
}

// "Highest A, B and C counts of the year" — the single-species "the most this
// year" record copy, folded into one species-list line that drops each
// per-species count. Phrases the year the way the standalone record line does
// (absolute label once the year is past).
function buildCombinedSpeciesCountRecordSentence(
	highlight: CombinedSpeciesCountRecordHighlight
): string {
	const speciesList = buildSpeciesList(highlight.speciesNames);
	return `Highest ${speciesList} counts ${buildOfYearPhrase(highlight)}`;
}

const PLACEMENT_RANK_WORD: Record<2 | 3, string> = {
	2: 'second best',
	3: 'third best'
};
const PLACEMENT_TIED_WORD: Record<2 | 3, string> = {
	2: 'tied second',
	3: 'tied third'
};

// "Second best day for Dunnock and Whitethroat ever" and its variants: several
// all-time 2nd/3rd-best species records folded into one line. A combined line
// never shows a count (only a lone unmerged placement does). An all-joint group
// leads with "Joint"; a mixed group leads plain and flags each joint species
// inline ("(tied second) Whitethroat").
function buildCombinedSpeciesPlacementRecordSentence(
	highlight: CombinedSpeciesPlacementRecordHighlight
): string {
	const { placementRank, species } = highlight;
	const rankWord = PLACEMENT_RANK_WORD[placementRank];
	const allJoint = species.every((entry) => entry.isJoint);
	const descriptor = allJoint
		? `Joint ${rankWord} day`
		: `${capitalize(rankWord)} day`;
	const tiedWord = PLACEMENT_TIED_WORD[placementRank];
	// An all-joint group's "Joint" prefix covers every species, so no inline flags;
	// a mixed group flags only the joint species, leaving the strict ones bare.
	const speciesNames = allJoint
		? species.map((entry) => entry.name)
		: species.map((entry) =>
				entry.isJoint ? `(${tiedWord}) ${entry.name}` : entry.name
			);
	return `${descriptor} for ${buildSpeciesList(speciesNames)} ever`;
}

function buildSpeciesCountRecordSentence(
	highlight: SpeciesCountRecordHighlight
): string {
	const { speciesName, value } = highlight;
	const valueCopy = `${value} caught`;
	if (highlight.recordEqualledYearsAgo !== undefined) {
		return `Record-equalling day for ${speciesName} — ${valueCopy}, most for ${buildYearsAgoCopy(highlight.recordEqualledYearsAgo)}`;
	}
	if (highlight.placementRank !== undefined) {
		const rankCopy = { 1: 'best', 2: 'second best', 3: 'third best' }[
			highlight.placementRank
		];
		const jointPrefix = highlight.isJointPlacement ? 'Joint ' : '';
		// Non-joint placements open the sentence, so capitalise the ordinal;
		// with a "Joint " prefix the ordinal stays mid-sentence and lowercase.
		const placementCopy = jointPrefix ? rankCopy : capitalize(rankCopy);
		return `${jointPrefix}${placementCopy} day for ${speciesName} ever — ${value} birds`;
	}
	const currentPeriodPhrase = buildCurrentPeriodScopePhrase(highlight);
	// Remaining case: all-time (this-year handled by the phrase above)
	const mostPhrase =
		currentPeriodPhrase !== null
			? `the most ${currentPeriodPhrase}`
			: 'the most ever';
	return `Record day for ${speciesName} — ${valueCopy}, ${mostPhrase}`;
}

// The per-species juvenile counterpart to buildSpeciesCountRecordSentence,
// sharing its record / for-N-years tie / 1st-2nd-3rd placement shape but
// phrased around juveniles: "Most juvenile Robins ever — N caught",
// "Second best day for juvenile Robins ever — N caught".
function buildSpeciesJuvCountRecordSentence(
	highlight: SpeciesJuvCountRecordHighlight
): string {
	const { speciesName, value } = highlight;
	const valueCopy = `${value} caught`;
	const juvSpeciesPhrase = `juvenile ${speciesName}`;
	if (highlight.recordEqualledYearsAgo !== undefined) {
		return `Record-equalling day for ${juvSpeciesPhrase} — ${valueCopy}, most for ${buildYearsAgoCopy(highlight.recordEqualledYearsAgo)}`;
	}
	if (highlight.placementRank !== undefined) {
		const rankCopy = { 1: 'best', 2: 'second best', 3: 'third best' }[
			highlight.placementRank
		];
		const jointPrefix = highlight.isJointPlacement ? 'Joint ' : '';
		// Non-joint placements open the sentence, so capitalise the ordinal;
		// with a "Joint " prefix the ordinal stays mid-sentence and lowercase.
		const placementCopy = jointPrefix ? rankCopy : capitalize(rankCopy);
		return `${jointPrefix}${placementCopy} day for ${juvSpeciesPhrase} ever — ${value} birds`;
	}
	const currentPeriodPhrase = buildCurrentPeriodScopePhrase(highlight);
	const mostPhrase =
		currentPeriodPhrase !== null
			? `the most ${currentPeriodPhrase}`
			: 'the most ever';
	return `Most ${juvSpeciesPhrase} — ${valueCopy}, ${mostPhrase}`;
}

const SINCE_COMPARISON_DESCRIPTOR: Record<SinceComparisonKind, string> = {
	busiest: 'Busiest',
	quietest: 'Quietest'
};

function buildSinceComparisonSentence(
	highlight: SinceComparisonHighlight
): string {
	const descriptor = SINCE_COMPARISON_DESCRIPTOR[highlight.kind];
	const valueCopy = `${highlight.value} birds`;
	if (highlight.sinceDate === undefined) {
		return `${descriptor} session ever — ${valueCopy}`;
	}
	return `${descriptor} session since ${formatShortDate(highlight.sinceDate)} — ${valueCopy}`;
}

// ---- renderer ----

type HighlightRenderer<T extends CountHighlight['type']> = (
	highlight: Extract<CountHighlight, { type: T }>
) => ReactElement;

// The mapped type is a compile-time guarantee that every Counts variant has a
// renderer — a missing variant is a tsc error, narrowed to only this group's
// own union (not the global SessionHighlight union).
export const HIGHLIGHT_RENDERERS: {
	[T in CountHighlight['type']]: HighlightRenderer<T>;
} = {
	'session-total-record': (highlight) =>
		renderSentence(buildSessionTotalRecordSentence(highlight)),
	'session-total-juv-record': (highlight) =>
		renderSentence(buildSessionTotalJuvRecordSentence(highlight)),
	'since-comparison': (highlight) =>
		renderSentence(buildSinceComparisonSentence(highlight)),
	'species-count-record': (highlight) =>
		renderSentence(buildSpeciesCountRecordSentence(highlight)),
	'species-juv-count-record': (highlight) =>
		renderSentence(buildSpeciesJuvCountRecordSentence(highlight)),
	'combined-session-total-record': (highlight) =>
		renderSentence(buildCombinedSessionTotalRecordSentence(highlight)),
	'combined-species-count-record': (highlight) =>
		renderSentence(buildCombinedSpeciesCountRecordSentence(highlight)),
	'combined-species-placement-record': (highlight) =>
		renderSentence(buildCombinedSpeciesPlacementRecordSentence(highlight))
};

export function renderCountHighlight(highlight: CountHighlight): ReactElement {
	// The record above guarantees a renderer per variant; this single
	// controlled cast erases the per-variant narrowing at the dispatch site
	const render = HIGHLIGHT_RENDERERS[highlight.type] as (
		matched: CountHighlight
	) => ReactElement;
	return render(highlight);
}
