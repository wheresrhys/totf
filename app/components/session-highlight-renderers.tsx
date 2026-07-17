'use client';
import type { ReactElement } from 'react';
import {
	buildFirstEverSpeciesSentence,
	buildFirstOfYearSpeciesSentence,
	buildLongAbsenceRetrapSentence,
	buildRareSpeciesSentence,
	buildSessionTotalRecordSentence,
	buildSinceComparisonSentence,
	buildSpeciesCountRecordSentence,
	buildWeightRecordSentence,
	type SessionHighlight
} from '@/app/models/session-highlights';

type HighlightRenderer<T extends SessionHighlight['type']> = (
	highlight: Extract<SessionHighlight, { type: T }>
) => ReactElement;

// Every highlight renders as a list item carrying its sentence; the sentence
// doubles as the React key. This module is the client-side home for highlight
// markup — a highlight that needs richer output (e.g. a <Link>) renders it here.
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
