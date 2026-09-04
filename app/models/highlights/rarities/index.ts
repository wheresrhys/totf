import type { SessionStatsData } from '@/app/models/highlights/shared/session-stats';
import { deriveFirstEverSpecies } from './derive-first-ever-species';
import { deriveFirstOfYearSpecies } from './derive-first-of-year-species';
import { deriveRareSpecies } from './derive-rare-species';
import { combineFirstRareHighlights } from './rules/combine-first-rare-highlights';
import { combineOnlyOfYearHighlights } from './rules/combine-only-of-year-highlights';
import { combineFirstEverHighlights } from './rules/combine-first-ever-highlights';
import { combineFirstOfYearHighlights } from './rules/combine-first-of-year-highlights';
import type { MegaSpeciesHighlight, RarityHighlight } from './types';

export { deriveFirstEverSpecies } from './derive-first-ever-species';
export { deriveFirstOfYearSpecies } from './derive-first-of-year-species';
export {
	deriveRareSpecies,
	MAX_RARE_SPECIES_SESSION_DAYS
} from './derive-rare-species';
export { combineFirstRareHighlights } from './rules/combine-first-rare-highlights';
export { combineOnlyOfYearHighlights } from './rules/combine-only-of-year-highlights';
export { combineFirstEverHighlights } from './rules/combine-first-ever-highlights';
export { combineFirstOfYearHighlights } from './rules/combine-first-of-year-highlights';
export * from './types';

// Applied in the same relative order the old flat machine ran them in — Comb-0
// must precede the others so the specific first/only line it needs is still
// present, un-combined into a multi-species line.
const RULES: ((highlights: RarityHighlight[]) => RarityHighlight[])[] = [
	combineFirstRareHighlights,
	combineOnlyOfYearHighlights,
	combineFirstEverHighlights,
	combineFirstOfYearHighlights
];

function isMega(highlight: RarityHighlight): highlight is MegaSpeciesHighlight {
	return highlight.type === 'mega-species';
}

// Runs the Rarities group's derive -> rules pipeline, then composes the final
// ordered list as a literal concatenation of blocks — no computed priority
// number, no global order rule shared with the other groups.
//
// [megaBlock, onlyEverBlock, firstEverBlock, rareBlock, firstOfYearBlock]:
// this order (and rareBlock's inclusion, not spelled out in the ticket's block
// list but present in every prior implementation) reproduces the old flat
// HIGHLIGHT_FAMILIES priority ('mega-species' < 'only-ever-species' <
// 'first-ever-species' < 'rare-species' < ... < 'first-of-year-species') for
// every highlight that stays within this group. The one intentional deviation
// from that old order: first-of-year now sorts as part of Rarities (last
// within this group) rather than after every Counts family — an accepted
// consequence of the group-split architecture (see #409 PR description).
// Each block preserves the rules-output pool's relative order (i.e.
// generation order, since the combine rules above replace-in-place), except
// megaBlock, which the ticket explicitly orders by rarity (days-ever
// ascending).
export function runRaritiesGroup({
	date,
	stats,
	today = new Date()
}: {
	date: string;
	stats: SessionStatsData;
	today?: Date;
}): RarityHighlight[] {
	const pool: RarityHighlight[] = [
		...deriveFirstEverSpecies({ date, stats }),
		...deriveFirstOfYearSpecies({ date, stats, today }),
		...deriveRareSpecies({ date, stats })
	];
	const afterRules = RULES.reduce((current, rule) => rule(current), pool);

	const megaBlock = afterRules
		.filter(isMega)
		.sort((a, b) => a.totalSessionDays - b.totalSessionDays);
	const onlyEverBlock = afterRules.filter(
		(highlight) =>
			highlight.type === 'first-ever-species' && highlight.isOnlyRecord
	);
	const firstEverBlock = afterRules.filter(
		(highlight) =>
			(highlight.type === 'first-ever-species' && !highlight.isOnlyRecord) ||
			highlight.type === 'combined-first-ever'
	);
	const rareBlock = afterRules.filter(
		(highlight) => highlight.type === 'rare-species'
	);
	const firstOfYearBlock = afterRules.filter(
		(highlight) =>
			highlight.type === 'first-of-year-species' ||
			highlight.type === 'combined-first-of-year' ||
			highlight.type === 'combined-only-of-year'
	);

	return [
		...megaBlock,
		...onlyEverBlock,
		...firstEverBlock,
		...rareBlock,
		...firstOfYearBlock
	];
}
