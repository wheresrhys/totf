import type { ReactElement } from 'react';
import { format as formatDate } from 'date-fns';

// Pulled out of the old flat session-highlight-renderers.tsx (#409/#760) — the
// <li> wrapper plus the handful of formatting helpers reused by more than one
// group's renderer. Each group's own renderer file (rarities/counts/vital-stats)
// stays pure data -> sentence for that group's own union; this file holds only
// what's genuinely shared across at least two of them, per
// docs/session-highlight-ordering.md.

// Every highlight renders as a list item carrying its sentence; the sentence
// doubles as the React key.
export function renderSentence(sentence: string): ReactElement {
	return <li key={sentence}>{sentence}</li>;
}

// Capitalises a word's first letter — used wherever a phrase's leading word
// depends on a runtime value (e.g. "heaviest"/"Heaviest", "second
// best"/"Second best") and must read as a sentence-opener only when nothing
// else (a rank digit, a "Joint " prefix) already precedes it. Shared by the
// Counts and Vital-stats renderers.
export function capitalize(word: string): string {
	return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

// A comma list with "and" before the last name: two names read "A and B",
// three "A, B and C". Combined highlights always list at least two species.
// Shared by the Rarities and Counts renderers.
export function buildSpeciesList(speciesNames: string[]): string {
	return speciesNames.length === 2
		? speciesNames.join(' and ')
		: `${speciesNames.slice(0, -1).join(', ')} and ${speciesNames.at(-1)}`;
}

// "of the year" while the year is still current; otherwise "of <year>".
// Shared by the Rarities and Counts renderers.
export function buildOfYearPhrase(highlight: {
	isCurrentYear: boolean;
	year: number;
}): string {
	return highlight.isCurrentYear ? 'of the year' : `of ${highlight.year}`;
}

// "12 May 2023" — the short date format every "since <date>"/"last seen
// <date>" phrase uses. Shared by the Counts since-comparison renderer and the
// long-absence-retrap sibling renderer.
export function formatShortDate(isoDate: string): string {
	return formatDate(new Date(isoDate), 'd MMM yyyy');
}
