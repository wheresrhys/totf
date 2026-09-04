import type { ReactElement } from 'react';
import type {
	CombinedWeightRecordHighlight,
	VitalStatHighlight,
	WeightRecordExtreme,
	WeightRecordHighlight
} from '@/app/models/highlights';
import {
	capitalize,
	renderSentence
} from '@/app/components/highlights/shared/render-sentence';

// ---- copy builders ----

// The bare extreme word ('heaviest'/'lightest'), combined with a placement
// prefix ('', '2nd-', '3rd-') and capitalised for the sentence
const WEIGHT_RECORD_EXTREME_WORD: Record<WeightRecordExtreme, string> = {
	heaviest: 'heaviest',
	lightest: 'lightest'
};

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
		placementRank === 1 ? capitalize(extremeWord) : rankedExtreme;
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
		: capitalize(extremeWord);
	// "2nd heaviest ever" — a space, unlike the hyphenated standalone weight lines
	const allTimeRankWord = highlight.allTimeRank === 2 ? '2nd' : '3rd';
	const parenthetical = `(${highlight.allTimeIsJoint ? 'joint ' : ''}${allTimeRankWord} ${extremeWord} ever)`;
	return `${headline} ${highlight.speciesName} weighed ${yearPhrase} ${parenthetical} — ${highlight.weight}g`;
}

// ---- renderer ----

type HighlightRenderer<T extends VitalStatHighlight['type']> = (
	highlight: Extract<VitalStatHighlight, { type: T }>
) => ReactElement;

// The mapped type is a compile-time guarantee that every Vital-stats variant
// has a renderer — a missing variant is a tsc error, narrowed to only this
// group's own union (not the global SessionHighlight union).
export const HIGHLIGHT_RENDERERS: {
	[T in VitalStatHighlight['type']]: HighlightRenderer<T>;
} = {
	'weight-record': (highlight) =>
		renderSentence(buildWeightRecordSentence(highlight)),
	'combined-weight-record': (highlight) =>
		renderSentence(buildCombinedWeightRecordSentence(highlight))
};

export function renderVitalStatHighlight(
	highlight: VitalStatHighlight
): ReactElement {
	// The record above guarantees a renderer per variant; this single
	// controlled cast erases the per-variant narrowing at the dispatch site
	const render = HIGHLIGHT_RENDERERS[highlight.type] as (
		matched: VitalStatHighlight
	) => ReactElement;
	return render(highlight);
}
