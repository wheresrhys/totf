import type { ReactElement } from 'react';
import type {
	CombinedFirstEverHighlight,
	CombinedFirstOfYearHighlight,
	CombinedOnlyOfYearHighlight,
	FirstEverSpeciesHighlight,
	FirstOfYearSpeciesHighlight,
	MegaSpeciesHighlight,
	RareSpeciesHighlight,
	RarityHighlight
} from '@/app/models/highlights';
import {
	buildOfYearPhrase,
	buildSpeciesList,
	renderSentence
} from '@/app/components/highlights/shared/render-sentence';

// ---- copy builders ----

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
	return `MEGA — ${highlight.speciesName} seen on only ${highlight.totalSessionDays} days ever`;
}

// A MEGA line folds a first/only record together with the same species' rarity.
// The first/only line is the headline; the rarity rides in a parenthetical,
// except for an "only ... ever" record, which already implies maximal rarity.
//   of-year: "MEGA — Only Meadow Pipit records of 2023 (only 3 records ever)"
//   first ever: "MEGA — First Meadow Pipit ever (only recorded on 2 other occasions)"
//   only ever: "MEGA — Only Meadow Pipit record ever" (no rarity note)
function buildMegaSpeciesSentence(highlight: MegaSpeciesHighlight): string {
	const { base, totalSessionDays } = highlight;
	if (base.type === 'first-of-year-species') {
		// The of-year headline stays as-is; the all-time rarity rides alongside it
		return `MEGA — ${buildFirstOfYearSpeciesSentence(base)} (only ${totalSessionDays} records ever)`;
	}
	if (base.isOnlyRecord) {
		// "Only ... ever" is the species' sole record — already maximally rare
		return `MEGA — ${buildFirstEverSpeciesSentence(base)}`;
	}
	// "First ... ever": this session is the earliest of the few days the species
	// appears, so the rarity note counts the other occasions
	const otherOccasions = totalSessionDays - 1;
	const occasionsWord = otherOccasions === 1 ? 'occasion' : 'occasions';
	return `MEGA — First ${base.speciesName} ever (only recorded on ${otherOccasions} other ${occasionsWord})`;
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

// ---- renderer ----

type HighlightRenderer<T extends RarityHighlight['type']> = (
	highlight: Extract<RarityHighlight, { type: T }>
) => ReactElement;

// The mapped type is a compile-time guarantee that every Rarities variant has
// a renderer — a missing variant is a tsc error, narrowed to only this
// group's own union (not the global SessionHighlight union).
export const HIGHLIGHT_RENDERERS: {
	[T in RarityHighlight['type']]: HighlightRenderer<T>;
} = {
	'first-ever-species': (highlight) =>
		renderSentence(buildFirstEverSpeciesSentence(highlight)),
	'first-of-year-species': (highlight) =>
		renderSentence(buildFirstOfYearSpeciesSentence(highlight)),
	'rare-species': (highlight) =>
		renderSentence(buildRareSpeciesSentence(highlight)),
	'mega-species': (highlight) =>
		renderSentence(buildMegaSpeciesSentence(highlight)),
	'combined-only-of-year': (highlight) =>
		renderSentence(buildCombinedOnlyOfYearSentence(highlight)),
	'combined-first-ever': (highlight) =>
		renderSentence(buildCombinedFirstEverSentence(highlight)),
	'combined-first-of-year': (highlight) =>
		renderSentence(buildCombinedFirstOfYearSentence(highlight))
};

export function renderRarityHighlight(
	highlight: RarityHighlight
): ReactElement {
	// The record above guarantees a renderer per variant; this single
	// controlled cast erases the per-variant narrowing at the dispatch site
	const render = HIGHLIGHT_RENDERERS[highlight.type] as (
		matched: RarityHighlight
	) => ReactElement;
	return render(highlight);
}
