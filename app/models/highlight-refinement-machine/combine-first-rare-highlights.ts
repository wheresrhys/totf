import {
	familySortValue,
	type FirstEverSpeciesHighlight,
	type FirstOfYearSpeciesHighlight,
	type MegaSpeciesHighlight,
	type RareSpeciesHighlight,
	type SessionHighlight
} from '@/app/models/session-highlights';

function isRareSpecies(
	highlight: SessionHighlight
): highlight is RareSpeciesHighlight {
	return highlight.type === 'rare-species';
}

function isFirstOrOnly(
	highlight: SessionHighlight
): highlight is FirstEverSpeciesHighlight | FirstOfYearSpeciesHighlight {
	return (
		highlight.type === 'first-ever-species' ||
		highlight.type === 'first-of-year-species'
	);
}

// Comb-0: a first/only record — of the year or ever — for a species the group
// has only ever recorded on a handful of session days (a rare-species highlight)
// merges both lines into one "MEGA" headline for that species. The first/only
// line supplies the headline; the rare-species line is folded in as the rarity
// note (totalSessionDays) and drops out. The combined line takes the position of
// the first/only highlight it replaces.
//
// This runs BEFORE the other combine rules so the specific first/only line is
// consumed here — otherwise combineOnlyOfYearHighlights / combineFirstOfYearHighlights
// would have already folded it into a multi-species "First/Only A, B and C" line,
// losing the pairing with its rare-species highlight.
export function combineFirstRareHighlights(
	highlights: SessionHighlight[]
): SessionHighlight[] {
	const megaByBase = new Map<SessionHighlight, MegaSpeciesHighlight>();
	const consumedRareHighlights = new Set<SessionHighlight>();
	for (const highlight of highlights) {
		if (!isFirstOrOnly(highlight)) continue;
		const rareHighlight = highlights.find(
			(candidate) =>
				isRareSpecies(candidate) &&
				candidate.speciesName === highlight.speciesName &&
				!consumedRareHighlights.has(candidate)
		);
		if (!rareHighlight || !isRareSpecies(rareHighlight)) continue;
		consumedRareHighlights.add(rareHighlight);
		megaByBase.set(highlight, {
			type: 'mega-species',
			sortValue: familySortValue('mega-species'),
			base: highlight,
			totalSessionDays: rareHighlight.totalSessionDays
		});
	}
	if (megaByBase.size === 0) return highlights;

	// Each MEGA takes the position of the first/only highlight it replaces; the
	// absorbed rare-species highlight just drops out.
	const result: SessionHighlight[] = [];
	for (const highlight of highlights) {
		const mega = megaByBase.get(highlight);
		if (mega) {
			result.push(mega);
			continue;
		}
		if (consumedRareHighlights.has(highlight)) continue;
		result.push(highlight);
	}
	return result;
}
