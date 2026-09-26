import type { ReactElement } from 'react';
import { format as formatDate } from 'date-fns';

// Pulled out of the old flat session-highlight-renderers.tsx (#409/#760) — the
// <li> wrapper plus the handful of formatting helpers reused by more than one
// group's renderer. Each group's own renderer file stays pure data -> sentence
// for that group's own union; this file holds only what's genuinely shared
// across at least two of them, per docs/session-highlight-ordering.md.
//
// Only the Vital-stats renderer and the long-absence-retrap sibling read this
// now — the Counts (#989) and Rarities (#990) renderers were deleted when those
// groups moved to the v2 pipeline, whose rules format their own sentences. The
// species-list and of-year helpers went with them, since both only ever served
// the multi-species combined lines v2 doesn't produce (see
// combineSimilarHighlights in app/lib/highlights/v2/lib/time-period-highlights.ts).

// Every highlight renders as a list item carrying its sentence; the sentence
// doubles as the React key.
export function renderSentence(sentence: string): ReactElement {
	return <li key={sentence}>{sentence}</li>;
}

// Capitalises a word's first letter — used wherever a phrase's leading word
// depends on a runtime value (e.g. "heaviest"/"Heaviest", "second
// best"/"Second best") and must read as a sentence-opener only when nothing
// else (a rank digit, a "Joint " prefix) already precedes it. Used by the
// Vital-stats renderer.
export function capitalize(word: string): string {
	return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

// "12 May 2023" — the short date format every "since <date>"/"last seen
// <date>" phrase uses. Used by the long-absence-retrap sibling renderer.
export function formatShortDate(isoDate: string): string {
	return formatDate(new Date(isoDate), 'd MMM yyyy');
}
