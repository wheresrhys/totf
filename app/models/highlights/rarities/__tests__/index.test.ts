import { describe, it, expect } from 'vitest';
import {
	SESSION_DATE,
	PAST_PERIOD_TODAY,
	PRIOR_SUMMER_OTHER_YEAR,
	PRIOR_THIS_SEASON,
	LATER_DAY,
	speciesRow,
	statsFor
} from '@/app/models/highlights/__tests__/fixtures';
import { runRaritiesGroup } from '..';

// Species set covering each block in one session:
// - Wryneck: first-of-year + rare (2 days total) -> folds into MEGA
// - Wallcreeper: first-ever, no other day at all -> onlyEverBlock
// - Osprey: first-ever, with a later occurrence (not only) -> firstEverBlock
// - Firecrest: rare (3 days total), already seen earlier this year -> rareBlock
//   (not first-of-year, since it already has a 2024 appearance)
// - Robin: first-of-year (not only, >3 days total so not rare) -> firstOfYearBlock
describe('runRaritiesGroup — block concatenation (integration)', () => {
	it('composes [megaBlock, onlyEverBlock, firstEverBlock, rareBlock, firstOfYearBlock] in that order', () => {
		const results = [
			// Wryneck -> MEGA
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, 'Wryneck', 1),
			speciesRow(SESSION_DATE, 'Wryneck', 1),
			// Wallcreeper -> onlyEverBlock
			speciesRow(SESSION_DATE, 'Wallcreeper', 1),
			// Osprey -> firstEverBlock
			speciesRow(SESSION_DATE, 'Osprey', 1),
			speciesRow(LATER_DAY, 'Osprey', 1),
			// Firecrest -> rareBlock (3 days total, already seen this year)
			speciesRow(PRIOR_SUMMER_OTHER_YEAR, 'Firecrest', 1),
			speciesRow(PRIOR_THIS_SEASON, 'Firecrest', 1),
			speciesRow(SESSION_DATE, 'Firecrest', 1),
			// Robin -> firstOfYearBlock (4 days total, not rare; a later 2024 day
			// keeps isOnlyRecord false)
			speciesRow('2019-05-01', 'Robin', 1),
			speciesRow('2020-05-01', 'Robin', 1),
			speciesRow(SESSION_DATE, 'Robin', 1),
			speciesRow(LATER_DAY, 'Robin', 1)
		];
		const highlights = runRaritiesGroup({
			date: SESSION_DATE,
			stats: statsFor(results),
			today: PAST_PERIOD_TODAY
		});
		expect(highlights.map((highlight) => highlight.type)).toEqual([
			'mega-species',
			'first-ever-species', // Wallcreeper — only ever
			'first-ever-species', // Osprey — plain
			'rare-species', // Firecrest
			'first-of-year-species' // Robin
		]);
		const mega = highlights[0];
		const onlyEver = highlights[1];
		if (
			mega.type !== 'mega-species' ||
			onlyEver.type !== 'first-ever-species'
		) {
			throw new Error('unexpected highlight shape');
		}
		expect(mega.base.speciesName).toBe('Wryneck');
		expect(onlyEver.speciesName).toBe('Wallcreeper');
		expect(onlyEver.isOnlyRecord).toBe(true);
	});
});
