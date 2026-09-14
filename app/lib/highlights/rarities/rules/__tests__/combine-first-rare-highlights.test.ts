import { describe, it, expect } from 'vitest';
import { combineFirstRareHighlights } from '../combine-first-rare-highlights';
import { firstOfYear, firstEver, rare, mega } from './fixtures';

describe('combineFirstRareHighlights (Comb-0)', () => {
	it('merges a first-of-year highlight with the same species rare highlight', () => {
		const firstOfYearMeadowPipit = firstOfYear('Meadow Pipit', false);
		const combined = combineFirstRareHighlights([
			firstOfYearMeadowPipit,
			rare('Meadow Pipit', 3)
		]);
		expect(combined).toEqual([mega(firstOfYearMeadowPipit, 3)]);
	});

	it('merges an only-of-year highlight with the same species rare highlight', () => {
		const onlyOfYear = firstOfYear('Meadow Pipit', true);
		const combined = combineFirstRareHighlights([
			onlyOfYear,
			rare('Meadow Pipit', 2)
		]);
		expect(combined).toEqual([mega(onlyOfYear, 2)]);
	});

	it('merges a first-ever highlight with the same species rare highlight', () => {
		const firstEverMeadowPipit = firstEver('Meadow Pipit', false);
		const combined = combineFirstRareHighlights([
			firstEverMeadowPipit,
			rare('Meadow Pipit', 3)
		]);
		expect(combined).toEqual([mega(firstEverMeadowPipit, 3)]);
	});

	it('merges an only-ever highlight with the same species rare highlight', () => {
		const onlyEver = firstEver('Meadow Pipit', true);
		const combined = combineFirstRareHighlights([
			onlyEver,
			rare('Meadow Pipit', 1)
		]);
		expect(combined).toEqual([mega(onlyEver, 1)]);
	});

	it('takes the list position of the first/only highlight and drops the rare', () => {
		const unrelated = firstEver('Chaffinch', false);
		const firstOfYearMeadowPipit = firstOfYear('Meadow Pipit', false);
		const combined = combineFirstRareHighlights([
			unrelated,
			firstOfYearMeadowPipit,
			rare('Meadow Pipit', 3)
		]);
		expect(combined).toEqual([unrelated, mega(firstOfYearMeadowPipit, 3)]);
	});

	it('leaves a rare highlight untouched when no first/only for its species is present', () => {
		const pool = [rare('Wryneck', 2), firstEver('Chaffinch', false)];
		expect(combineFirstRareHighlights(pool)).toEqual(pool);
	});

	it('leaves a first/only highlight untouched when its species has no rare highlight', () => {
		const pool = [firstOfYear('Meadow Pipit', false), rare('Wryneck', 2)];
		expect(combineFirstRareHighlights(pool)).toEqual(pool);
	});

	it('merges each species independently, leaving unmatched first/only highlights for later rules', () => {
		const meadowPipit = firstOfYear('Meadow Pipit', true);
		const chaffinch = firstOfYear('Chaffinch', true);
		const combined = combineFirstRareHighlights([
			meadowPipit,
			chaffinch,
			rare('Meadow Pipit', 3)
		]);
		// Meadow Pipit folds into a MEGA; Chaffinch (no rare) is left for Comb-2
		expect(combined).toEqual([mega(meadowPipit, 3), chaffinch]);
	});

	it('is a noop on unrelated highlights', () => {
		const pool = [firstEver('Chaffinch', false), rare('Dunnock', 2)];
		expect(combineFirstRareHighlights(pool)).toEqual(pool);
	});

	it('does not mutate the input list', () => {
		const pool = [firstOfYear('Meadow Pipit', false), rare('Meadow Pipit', 3)];
		const snapshot = [...pool];
		combineFirstRareHighlights(pool);
		expect(pool).toEqual(snapshot);
	});
});
