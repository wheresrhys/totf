'use client';
import type { ReactElement } from 'react';
import { format as formatDate } from 'date-fns';
import type {
	FirstEverSpeciesHighlight,
	FirstOfYearSpeciesHighlight,
	LongAbsenceRetrapHighlight,
	RareSpeciesHighlight,
	RecordScope,
	SessionHighlight,
	SessionTotalMetric,
	SessionTotalRecordHighlight,
	SinceComparisonHighlight,
	SinceComparisonKind,
	SpeciesCountRecordHighlight,
	WeightRecordExtreme,
	WeightRecordHighlight
} from '@/app/models/session-highlights';

// ---- copy builders ----
// Each family's sentence lives here, next to the markup that renders it — the
// model stays pure data. A highlight that needs richer output (e.g. a <Link>)
// builds it in its renderer below.

type PeriodFields = {
	scope: RecordScope;
	seasonName: string;
	year: number;
	isCurrentYear: boolean;
	isCurrentSeason: boolean;
	seasonPeriodLabel: string;
};

// Returns the scope-qualified phrase for "this year" / "this season" scopes
// where the copy changes depending on whether the period is still current.
// Handles the shared conditional logic for both session-total and species-record families.
// Returns null for all-time and any-season, which each family phrases differently.
// yearPreposition: 'in' for species-count ("the most in 2024"),
//                  'of' for session-total ("Busiest session of 2024")
function buildCurrentPeriodScopePhrase(
	fields: PeriodFields,
	yearPreposition: 'in' | 'of' = 'in'
): string | null {
	switch (fields.scope) {
		case 'this-year':
			return fields.isCurrentYear
				? 'this year'
				: `${yearPreposition} ${fields.year}`;
		case 'this-season':
			return fields.isCurrentSeason
				? `this ${fields.seasonName}`
				: `in ${fields.seasonPeriodLabel}`;
		default:
			return null;
	}
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
	// Remaining cases: all-time and any-season (this-year / this-season handled above)
	if (highlight.scope === 'any-season') {
		return `${descriptor} ${highlight.seasonName} session ever — ${valueCopy}`;
	}
	return `${descriptor} session ever — ${valueCopy}`;
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
	const mostPhrase =
		currentPeriodPhrase !== null
			? `the most ${currentPeriodPhrase}`
			: highlight.scope === 'all-time'
				? 'the most ever'
				: `the most in any ${highlight.seasonName}`;
	return `Record day for ${speciesName} — ${valueCopy}, ${mostPhrase}`;
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
	// A joint placement leads with "Joint"; otherwise the sentence opens with
	// the extreme word, which is only capitalised when a rank prefix (a digit)
	// isn't already sitting in front of it
	if (isJointPlacement) {
		return `Joint ${rankedExtreme} ${speciesName} ever weighed — ${weight}g`;
	}
	const descriptor =
		placementRank === 1
			? `${extremeWord[0].toUpperCase()}${extremeWord.slice(1)}`
			: rankedExtreme;
	return `${descriptor} ${speciesName} ever weighed — ${weight}g`;
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
	'since-comparison': (highlight) =>
		renderSentence(buildSinceComparisonSentence(highlight)),
	'species-count-record': (highlight) =>
		renderSentence(buildSpeciesCountRecordSentence(highlight)),
	'first-ever-species': (highlight) =>
		renderSentence(buildFirstEverSpeciesSentence(highlight)),
	'first-of-year-species': (highlight) =>
		renderSentence(buildFirstOfYearSpeciesSentence(highlight)),
	'rare-species': (highlight) =>
		renderSentence(buildRareSpeciesSentence(highlight)),
	'long-absence-retrap': (highlight) =>
		renderSentence(buildLongAbsenceRetrapSentence(highlight)),
	'weight-record': (highlight) =>
		renderSentence(buildWeightRecordSentence(highlight))
};

export function renderHighlight(highlight: SessionHighlight): ReactElement {
	// The record above guarantees a renderer per variant; this single
	// controlled cast erases the per-variant narrowing at the dispatch site
	const render = HIGHLIGHT_RENDERERS[highlight.type] as (
		matched: SessionHighlight
	) => ReactElement;
	return render(highlight);
}
