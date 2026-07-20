'use client';
import type { ReactElement } from 'react';
import { format as formatDate } from 'date-fns';
import type {
	CombinedFirstEverHighlight,
	CombinedFirstOfYearHighlight,
	CombinedOnlyOfYearHighlight,
	CombinedSessionTotalRecordHighlight,
	CombinedSpeciesCountRecordHighlight,
	CombinedSpeciesPlacementRecordHighlight,
	CombinedWeightRecordHighlight,
	FirstEverSpeciesHighlight,
	FirstOfYearSpeciesHighlight,
	LongAbsenceRetrapHighlight,
	RareSpeciesHighlight,
	RecordScope,
	SessionHighlight,
	SessionTotalMetric,
	SessionTotalRecordHighlight,
	SessionTotalJuvRecordHighlight,
	SinceComparisonHighlight,
	SinceComparisonKind,
	SpeciesCountRecordHighlight,
	SpeciesJuvCountRecordHighlight,
	WeightRecordExtreme,
	WeightRecordHighlight
} from '@/app/models/session-highlights';

// ---- copy builders ----
// Each family's sentence lives here, next to the markup that renders it — the
// model stays pure data. A highlight that needs richer output (e.g. a <Link>)
// builds it in its renderer below.

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

// A comma list with "and" before the last name: two names read "A and B",
// three "A, B and C". Combined highlights always list at least two species.
function buildSpeciesList(speciesNames: string[]): string {
	return speciesNames.length === 2
		? speciesNames.join(' and ')
		: `${speciesNames.slice(0, -1).join(', ')} and ${speciesNames.at(-1)}`;
}

// "of the year" while the year is still current; otherwise "of <year>".
function buildOfYearPhrase(highlight: {
	isCurrentYear: boolean;
	year: number;
}): string {
	return highlight.isCurrentYear ? 'of the year' : `of ${highlight.year}`;
}

// "Only A, B and C records of the year" — the plural "records" is fixed because
// a combined line always covers at least two species.
function buildCombinedOnlyOfYearSentence(
	highlight: CombinedOnlyOfYearHighlight
): string {
	return `Only ${buildSpeciesList(highlight.speciesNames)} records ${buildOfYearPhrase(highlight)}`;
}

// "First ever A, B and C records" — merges multiple singular/plural "First ever
// <species> record(s)" lines. Always plural "records": a combined line lists at
// least two species.
function buildCombinedFirstEverSentence(
	highlight: CombinedFirstEverHighlight
): string {
	return `First ever ${buildSpeciesList(highlight.speciesNames)} records`;
}

// "First A, B and C records of the year" — merges multiple "First <species>
// record(s) of the year" lines. Always plural "records" (see first-ever above).
function buildCombinedFirstOfYearSentence(
	highlight: CombinedFirstOfYearHighlight
): string {
	return `First ${buildSpeciesList(highlight.speciesNames)} records ${buildOfYearPhrase(highlight)}`;
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

// "Second best day for Dunnock and Whitethroat ever — 6 birds" and its variants:
// several all-time 2nd/3rd-best species records folded into one line. An all-joint
// group leads with "Joint" and drops the count; a mixed group leads plain and flags
// each joint species inline ("(tied second) Whitethroat"); the count only shows when
// every part agreed on it (carried on the highlight, absent otherwise).
function buildCombinedSpeciesPlacementRecordSentence(
	highlight: CombinedSpeciesPlacementRecordHighlight
): string {
	const { placementRank, species, value } = highlight;
	const rankWord = PLACEMENT_RANK_WORD[placementRank];
	const allJoint = species.every((entry) => entry.isJoint);
	const descriptor = allJoint
		? `Joint ${rankWord} day`
		: `${rankWord[0].toUpperCase()}${rankWord.slice(1)} day`;
	const tiedWord = PLACEMENT_TIED_WORD[placementRank];
	// An all-joint group's "Joint" prefix covers every species, so no inline flags;
	// a mixed group flags only the joint species, leaving the strict ones bare.
	const speciesNames = allJoint
		? species.map((entry) => entry.name)
		: species.map((entry) =>
				entry.isJoint ? `(${tiedWord}) ${entry.name}` : entry.name
			);
	const sentence = `${descriptor} for ${buildSpeciesList(speciesNames)} ever`;
	return value === undefined ? sentence : `${sentence} — ${value} birds`;
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
		const placementCopy = jointPrefix
			? rankCopy
			: rankCopy.charAt(0).toUpperCase() + rankCopy.slice(1);
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
		const placementCopy = jointPrefix
			? rankCopy
			: rankCopy.charAt(0).toUpperCase() + rankCopy.slice(1);
		return `${jointPrefix}${placementCopy} day for ${juvSpeciesPhrase} ever — ${value} birds`;
	}
	const currentPeriodPhrase = buildCurrentPeriodScopePhrase(highlight);
	const mostPhrase =
		currentPeriodPhrase !== null
			? `the most ${currentPeriodPhrase}`
			: 'the most ever';
	return `Most ${juvSpeciesPhrase} — ${valueCopy}, ${mostPhrase}`;
}

function buildSpeciesRecordsPhrase(
	highlight: FirstEverSpeciesHighlight | FirstOfYearSpeciesHighlight
): string {
	return `${highlight.speciesName} record${highlight.multipleIndividualsRecorded ? 's' : ''}`;
}

function buildFirstEverSpeciesSentence(
	highlight: FirstEverSpeciesHighlight
): string {
	return highlight.isOnlyRecord
		? `Only ${buildSpeciesRecordsPhrase(highlight)} ever`
		: `First ever ${buildSpeciesRecordsPhrase(highlight)}`;
}

function buildFirstOfYearSpeciesSentence(
	highlight: FirstOfYearSpeciesHighlight
): string {
	const yearPhrase = highlight.isCurrentYear
		? 'of the year'
		: `of ${highlight.year}`;
	return `${highlight.isOnlyRecord ? 'Only' : 'First'} ${buildSpeciesRecordsPhrase(highlight)} ${yearPhrase}`;
}

function buildRareSpeciesSentence(highlight: RareSpeciesHighlight): string {
	return `Rarely recorded — ${highlight.speciesName} seen on only ${highlight.totalSessionDays} days ever`;
}

function buildLongAbsenceRetrapSentence(
	highlight: LongAbsenceRetrapHighlight
): string {
	const yearsPart = `${highlight.gapYears} ${highlight.gapYears === 1 ? 'year' : 'years'}`;
	const gapPhrase =
		highlight.gapMonths === 0
			? yearsPart
			: `${yearsPart}, ${highlight.gapMonths} ${highlight.gapMonths === 1 ? 'month' : 'months'}`;
	const formattedPreviousDate = formatDate(
		new Date(highlight.previousDate),
		'd MMM yyyy'
	);
	return `${highlight.speciesName} ${highlight.ringNo} recaught after ${gapPhrase} away (last seen ${formattedPreviousDate})`;
}

// The bare extreme word ('heaviest'/'lightest'), combined with a placement
// prefix ('', '2nd-', '3rd-') and capitalised for the sentence
const WEIGHT_RECORD_EXTREME_WORD: Record<WeightRecordExtreme, string> = {
	heaviest: 'heaviest',
	lightest: 'lightest'
};

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
	const formattedSinceDate = formatDate(
		new Date(highlight.sinceDate),
		'd MMM yyyy'
	);
	return `${descriptor} session since ${formattedSinceDate} — ${valueCopy}`;
}

const WEIGHT_PLACEMENT_PREFIX: Record<1 | 2 | 3, string> = {
	1: '',
	2: '2nd-',
	3: '3rd-'
};

function buildWeightRecordSentence(highlight: WeightRecordHighlight): string {
	const { speciesName, extreme, weight, placementRank, isJointPlacement } =
		highlight;
	const extremeWord = WEIGHT_RECORD_EXTREME_WORD[extreme];
	// "heaviest" / "2nd-heaviest" / "3rd-heaviest"
	const rankedExtreme = `${WEIGHT_PLACEMENT_PREFIX[placementRank]}${extremeWord}`;
	// All-time reads "ever weighed"; this-year reads "weighed this year" while the
	// year is current, otherwise "weighed in <year>".
	const periodPhrase =
		highlight.scope === 'all-time'
			? 'ever weighed'
			: `weighed ${highlight.isCurrentYear ? 'this year' : `in ${highlight.year}`}`;
	// A joint placement leads with "Joint"; otherwise the sentence opens with
	// the extreme word, which is only capitalised when a rank prefix (a digit)
	// isn't already sitting in front of it
	if (isJointPlacement) {
		return `Joint ${rankedExtreme} ${speciesName} ${periodPhrase} — ${weight}g`;
	}
	const descriptor =
		placementRank === 1
			? `${extremeWord[0].toUpperCase()}${extremeWord.slice(1)}`
			: rankedExtreme;
	return `${descriptor} ${speciesName} ${periodPhrase} — ${weight}g`;
}

// "Heaviest Blue Tit weighed in 2024 (2nd heaviest ever) — 13.1g": the this-year
// claim leads, the all-time placement (always 2nd/3rd) rides in parentheses. Both
// the headline and the parenthetical can be joint.
function buildCombinedWeightRecordSentence(
	highlight: CombinedWeightRecordHighlight
): string {
	const extremeWord = WEIGHT_RECORD_EXTREME_WORD[highlight.extreme];
	const yearPhrase = highlight.isCurrentYear
		? 'this year'
		: `in ${highlight.year}`;
	const headline = highlight.thisYearIsJoint
		? `Joint ${extremeWord}`
		: `${extremeWord[0].toUpperCase()}${extremeWord.slice(1)}`;
	// "2nd heaviest ever" — a space, unlike the hyphenated standalone weight lines
	const allTimeRankWord = highlight.allTimeRank === 2 ? '2nd' : '3rd';
	const parenthetical = `(${highlight.allTimeIsJoint ? 'joint ' : ''}${allTimeRankWord} ${extremeWord} ever)`;
	return `${headline} ${highlight.speciesName} weighed ${yearPhrase} ${parenthetical} — ${highlight.weight}g`;
}

// ---- renderers ----

type HighlightRenderer<T extends SessionHighlight['type']> = (
	highlight: Extract<SessionHighlight, { type: T }>
) => ReactElement;

// Every highlight renders as a list item carrying its sentence; the sentence
// doubles as the React key.
function renderSentence(sentence: string): ReactElement {
	return <li key={sentence}>{sentence}</li>;
}

// The mapped type is a compile-time guarantee that every highlight type has a
// renderer: a missing variant is a tsc error, and each renderer's argument is
// narrowed to its own variant.
const HIGHLIGHT_RENDERERS: {
	[T in SessionHighlight['type']]: HighlightRenderer<T>;
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
	'first-ever-species': (highlight) =>
		renderSentence(buildFirstEverSpeciesSentence(highlight)),
	'first-of-year-species': (highlight) =>
		renderSentence(buildFirstOfYearSpeciesSentence(highlight)),
	'rare-species': (highlight) =>
		renderSentence(buildRareSpeciesSentence(highlight)),
	'long-absence-retrap': (highlight) =>
		renderSentence(buildLongAbsenceRetrapSentence(highlight)),
	'weight-record': (highlight) =>
		renderSentence(buildWeightRecordSentence(highlight)),
	'combined-weight-record': (highlight) =>
		renderSentence(buildCombinedWeightRecordSentence(highlight)),
	'combined-session-total-record': (highlight) =>
		renderSentence(buildCombinedSessionTotalRecordSentence(highlight)),
	'combined-only-of-year': (highlight) =>
		renderSentence(buildCombinedOnlyOfYearSentence(highlight)),
	'combined-first-ever': (highlight) =>
		renderSentence(buildCombinedFirstEverSentence(highlight)),
	'combined-first-of-year': (highlight) =>
		renderSentence(buildCombinedFirstOfYearSentence(highlight)),
	'combined-species-count-record': (highlight) =>
		renderSentence(buildCombinedSpeciesCountRecordSentence(highlight)),
	'combined-species-placement-record': (highlight) =>
		renderSentence(buildCombinedSpeciesPlacementRecordSentence(highlight))
};

export function renderHighlight(highlight: SessionHighlight): ReactElement {
	// The record above guarantees a renderer per variant; this single
	// controlled cast erases the per-variant narrowing at the dispatch site
	const render = HIGHLIGHT_RENDERERS[highlight.type] as (
		matched: SessionHighlight
	) => ReactElement;
	return render(highlight);
}
