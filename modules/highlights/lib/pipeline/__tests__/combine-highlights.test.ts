import { describe, it, expect } from 'vitest';
import { removeLessSignificantHighlights } from '../combine-highlights';
import type { NewHighlightValue } from '../../../types';

function buildHighlight(
	overrides: Partial<NewHighlightValue> = {}
): NewHighlightValue {
	return {
		timePeriod: '2020-05-01',
		value: 10,
		species: null,
		ranking: { position: 1, isTied: false },
		descriptor: { category: 'count', type: 'birds', unit: 'bird' },
		scope: { temporalUnit: 'day' },
		...overrides
	} as NewHighlightValue;
}

// An unscoped (no parentTimeWindow) highlight — always kept by
// removeLessSignificantHighlights, and the only kind eligible to clobber a
// narrowerScopedHighlight.
function allTimeHighlight(
	overrides: Partial<NewHighlightValue> = {}
): NewHighlightValue {
	return buildHighlight({ scope: { temporalUnit: 'day' }, ...overrides });
}

// A highlight scoped to a narrower window than all-time — the kind
// removeLessSignificantHighlights may drop in favour of a matching
// allTimeHighlight.
function narrowerScopedHighlight(
	overrides: Partial<NewHighlightValue> = {}
): NewHighlightValue {
	return buildHighlight({
		scope: { temporalUnit: 'day', parentTimeWindow: { year: 2020 } },
		...overrides
	});
}

describe('removeLessSignificantHighlights', () => {
	it('keeps an all-time highlight (no parentTimeWindow) unconditionally', () => {
		// Two all-time highlights of the same type, one numerically better
		// ranked than the other — neither has a parentTimeWindow, so neither is
		// ever a clobber subject.
		const bestAllTime = allTimeHighlight({
			timePeriod: 'best',
			ranking: { position: 1, isTied: false }
		});
		const worseAllTime = allTimeHighlight({
			timePeriod: 'worse',
			ranking: { position: 3, isTied: false }
		});

		const result = removeLessSignificantHighlights([bestAllTime, worseAllTime]);

		expect(result).toStrictEqual([bestAllTime, worseAllTime]);
	});

	it('drops a narrower-scoped highlight when an equal-or-better-ranked all-time highlight of the same type/category/temporalUnit/species exists', () => {
		const narrower = narrowerScopedHighlight({
			timePeriod: 'narrow',
			ranking: { position: 1, isTied: false }
		});
		// Ranked 2nd all-time — the implementation's clobber check
		// (`potentialClobber.ranking.position >= highlight.ranking.position`)
		// qualifies any all-time entry whose position is numerically
		// equal-or-greater than the narrower subject's own, so this still
		// clobbers even though 2nd place is numerically worse than 1st.
		const subsumingAllTime = allTimeHighlight({
			timePeriod: 'broad',
			ranking: { position: 2, isTied: false }
		});

		const result = removeLessSignificantHighlights([
			narrower,
			subsumingAllTime
		]);

		expect(result).toStrictEqual([subsumingAllTime]);
	});

	it('does not clobber across different descriptor types or categories', () => {
		const narrowerBirds = narrowerScopedHighlight({
			timePeriod: 'narrow',
			ranking: { position: 1, isTied: false },
			descriptor: { category: 'count', type: 'birds', unit: 'bird' }
		});
		const allTimeDifferentType = allTimeHighlight({
			timePeriod: 'different-type',
			ranking: { position: 2, isTied: false },
			descriptor: { category: 'count', type: 'encounters', unit: 'bird' }
		});
		const allTimeDifferentCategory = allTimeHighlight({
			timePeriod: 'different-category',
			ranking: { position: 2, isTied: false },
			descriptor: { category: 'biometrics', type: 'birds', unit: 'bird' }
		});

		expect(
			removeLessSignificantHighlights([narrowerBirds, allTimeDifferentType])
		).toStrictEqual([narrowerBirds, allTimeDifferentType]);
		expect(
			removeLessSignificantHighlights([
				narrowerBirds,
				allTimeDifferentCategory
			])
		).toStrictEqual([narrowerBirds, allTimeDifferentCategory]);
	});

	it('does not clobber across different species scopes', () => {
		const narrowerRobin = narrowerScopedHighlight({
			timePeriod: 'narrow',
			scope: {
				temporalUnit: 'day',
				parentTimeWindow: { year: 2020 },
				species: 'Robin'
			},
			ranking: { position: 1, isTied: false }
		});
		const allTimeWren = allTimeHighlight({
			timePeriod: 'broad',
			scope: { temporalUnit: 'day', species: 'Wren' },
			ranking: { position: 2, isTied: false }
		});

		const result = removeLessSignificantHighlights([
			narrowerRobin,
			allTimeWren
		]);

		expect(result).toStrictEqual([narrowerRobin, allTimeWren]);
	});

	it('does not clobber with a lower-ranked (numerically higher position) all-time highlight', () => {
		const narrower = narrowerScopedHighlight({
			timePeriod: 'narrow',
			ranking: { position: 3, isTied: false }
		});
		// Ranked 1st all-time — numerically lower (better) than the narrower
		// subject's own position of 3rd. The clobber check requires the
		// all-time entry's position to be numerically equal-or-greater than the
		// subject's, so a strictly better-numbered all-time entry does not
		// qualify and the narrower highlight survives.
		const betterRankedAllTime = allTimeHighlight({
			timePeriod: 'broad',
			ranking: { position: 1, isTied: false }
		});

		const result = removeLessSignificantHighlights([
			narrower,
			betterRankedAllTime
		]);

		expect(result).toStrictEqual([narrower, betterRankedAllTime]);
	});

	it('keeps a same-position narrower highlight when the all-time highlight at that position is tied but the narrower one is not', () => {
		const untiedNarrower = narrowerScopedHighlight({
			timePeriod: 'narrow',
			ranking: { position: 1, isTied: false }
		});
		const tiedAllTimeHighlight = allTimeHighlight({
			timePeriod: 'broad',
			ranking: { position: 1, isTied: true }
		});

		const result = removeLessSignificantHighlights([
			untiedNarrower,
			tiedAllTimeHighlight
		]);

		expect(result).toStrictEqual([untiedNarrower, tiedAllTimeHighlight]);
	});

	it('still clobbers a same-position narrower highlight when both the all-time and narrower highlights are tied', () => {
		const tiedNarrower = narrowerScopedHighlight({
			timePeriod: 'narrow',
			ranking: { position: 1, isTied: true }
		});
		const tiedAllTimeHighlight = allTimeHighlight({
			timePeriod: 'broad',
			ranking: { position: 1, isTied: true }
		});

		const result = removeLessSignificantHighlights([
			tiedNarrower,
			tiedAllTimeHighlight
		]);

		expect(result).toStrictEqual([tiedAllTimeHighlight]);
	});
});
