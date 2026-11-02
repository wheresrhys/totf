import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	getCombinedHighlightsOfTypeAcrossScopes,
	getAllHighlightsOfOutlookAcrossScopes,
	getAllHighlightsAcrossScopes
} from '../run-highlights-pipeline';
import { getRawHighlightsOfTypeAcrossScopes } from '../fan-out-raw-highlights';
import {
	removeLessSignificantHighlights,
	combineSimilarHighlights
} from '../combine-highlights';
import { sortHighlights } from '../../highlight-utils';
import { ruleTypes } from '../../rule-registry';
import type { CombinedHighlight, NewHighlightValue } from '../../../types';
import type { ViewedGroup } from '@/app/lib/group-slug';

// The two boundary modules this orchestrator wires together, plus
// sortHighlights (a third collaborator used only by
// getAllHighlightsOfOutlookAcrossScopes) — every test in this file asserts on
// sequencing/wiring through these mocks, never on the real
// filtering/combining/sorting logic (covered in those modules' own suites).
vi.mock('../fan-out-raw-highlights', () => ({
	getRawHighlightsOfTypeAcrossScopes: vi.fn()
}));

vi.mock('../combine-highlights', () => ({
	removeLessSignificantHighlights: vi.fn(),
	combineSimilarHighlights: vi.fn()
}));

vi.mock('../../highlight-utils', () => ({
	sortHighlights: vi.fn()
}));

const viewedGroup: ViewedGroup = { id: 99, slug: null };

// Flat overrides merged over a sensible default, one per type this file
// fabricates fixtures for — not full nested object literals per call site.
function newHighlightValue(
	overrides: Partial<NewHighlightValue> = {}
): NewHighlightValue {
	return {
		timePeriod: '2026-03-01',
		value: 1,
		species: null,
		ranking: { position: 1, isTied: false },
		descriptor: { category: 'count', type: 'bird-count', unit: 'bird' },
		scope: { temporalUnit: 'month' },
		...overrides
	};
}

function combinedHighlight(
	overrides: Partial<CombinedHighlight> = {}
): CombinedHighlight {
	return {
		formatters: { combinedHighlightPrinter: () => '' },
		descriptor: { category: 'count', type: 'bird-count', unit: 'bird' },
		value: { timePeriod: '2026-03-01', value: 1, species: null },
		species: undefined,
		bestPosition: 1,
		scopes: [
			{
				scope: { temporalUnit: 'month' },
				ranking: { position: 1, isTied: false }
			}
		],
		...overrides
	};
}

beforeEach(() => {
	vi.mocked(getRawHighlightsOfTypeAcrossScopes).mockReset();
	vi.mocked(removeLessSignificantHighlights).mockReset();
	vi.mocked(combineSimilarHighlights).mockReset();
	vi.mocked(sortHighlights).mockReset();
});

describe('getCombinedHighlightsOfTypeAcrossScopes', () => {
	it('runs the raw fan-out, then significance filtering, then combining, in that order', async () => {
		const options = {
			timePeriod: '2026-03-01',
			temporalUnit: 'month' as const,
			viewedGroup,
			outlook: 'inter' as const,
			highlightType: 'bird-count'
		};
		const rawHighlights = [newHighlightValue()];
		const significantHighlights = [
			newHighlightValue({ ranking: { position: 1, isTied: true } })
		];
		const combinedHighlights = [combinedHighlight()];

		vi.mocked(getRawHighlightsOfTypeAcrossScopes).mockResolvedValue(
			rawHighlights
		);
		vi.mocked(removeLessSignificantHighlights).mockReturnValue(
			significantHighlights
		);
		vi.mocked(combineSimilarHighlights).mockReturnValue(combinedHighlights);

		const result = await getCombinedHighlightsOfTypeAcrossScopes(options);

		expect(getRawHighlightsOfTypeAcrossScopes).toHaveBeenCalledWith(options);
		expect(removeLessSignificantHighlights).toHaveBeenCalledWith(
			rawHighlights
		);
		expect(combineSimilarHighlights).toHaveBeenCalledWith(
			significantHighlights,
			options.highlightType
		);

		const fanOutOrder =
			vi.mocked(getRawHighlightsOfTypeAcrossScopes).mock
				.invocationCallOrder[0];
		const filterOrder =
			vi.mocked(removeLessSignificantHighlights).mock.invocationCallOrder[0];
		const combineOrder =
			vi.mocked(combineSimilarHighlights).mock.invocationCallOrder[0];
		expect(fanOutOrder).toBeLessThan(filterOrder);
		expect(filterOrder).toBeLessThan(combineOrder);

		expect(result).toBe(combinedHighlights);
	});
});

describe('getAllHighlightsOfOutlookAcrossScopes', () => {
	const options = {
		timePeriod: '2026-03-01',
		temporalUnit: 'month' as const,
		viewedGroup,
		outlook: 'intra' as const
	};

	beforeEach(() => {
		vi.mocked(getRawHighlightsOfTypeAcrossScopes).mockResolvedValue([]);
		vi.mocked(removeLessSignificantHighlights).mockImplementation(
			(highlights) => highlights
		);
	});

	it('runs every registered rule type for the given outlook and flattens the results', async () => {
		// Each type's combineSimilarHighlights call returns two highlights
		// tagged with that same type, so the flattened output can be checked
		// both for completeness (every ruleType represented) and shape
		// (flattened, not nested per-type).
		vi.mocked(combineSimilarHighlights).mockImplementation(
			(_highlights, highlightType) => [
				combinedHighlight({
					descriptor: { category: 'count', type: highlightType, unit: 'bird' }
				}),
				combinedHighlight({
					descriptor: { category: 'count', type: highlightType, unit: 'bird' }
				})
			]
		);
		vi.mocked(sortHighlights).mockImplementation((highlights) => highlights);

		const result = await getAllHighlightsOfOutlookAcrossScopes(options);

		expect(getRawHighlightsOfTypeAcrossScopes).toHaveBeenCalledTimes(
			ruleTypes.length
		);
		for (const ruleType of ruleTypes) {
			expect(getRawHighlightsOfTypeAcrossScopes).toHaveBeenCalledWith({
				highlightType: ruleType,
				...options
			});
		}

		expect(result).toHaveLength(ruleTypes.length * 2);
		expect(
			result.map((highlight) => highlight.descriptor.type).sort()
		).toEqual(ruleTypes.flatMap((type) => [type, type]).sort());
	});

	it('sorts the combined output via sortHighlights', async () => {
		vi.mocked(combineSimilarHighlights).mockReturnValue([
			combinedHighlight({
				descriptor: { category: 'count', type: 'unsorted', unit: 'bird' }
			})
		]);
		const sortedSentinel = [
			combinedHighlight({
				descriptor: {
					category: 'count',
					type: 'sorted-sentinel',
					unit: 'bird'
				}
			})
		];
		vi.mocked(sortHighlights).mockReturnValue(sortedSentinel);

		const result = await getAllHighlightsOfOutlookAcrossScopes(options);

		expect(sortHighlights).toHaveBeenCalledTimes(1);
		// One flattened entry per ruleType was handed to sortHighlights...
		expect(vi.mocked(sortHighlights).mock.calls[0][0]).toHaveLength(
			ruleTypes.length
		);
		// ...and the function's own return value is what comes back, not a
		// re-derivation of it.
		expect(result).toBe(sortedSentinel);
	});
});

describe('getAllHighlightsAcrossScopes', () => {
	const options = {
		timePeriod: '2026-03-01',
		temporalUnit: 'month' as const,
		viewedGroup
	};

	it('runs the inter and intra outlooks concurrently and returns them under separate keys', async () => {
		// Tag each raw fan-out result with the outlook it was actually called
		// with (stashed in the otherwise-unused `species` field), then carry
		// that tag through every downstream collaborator, so the final
		// per-outlook result can be checked against the outlook that produced
		// it — not just that both were requested.
		vi.mocked(getRawHighlightsOfTypeAcrossScopes).mockImplementation(
			async ({ outlook }) => [newHighlightValue({ species: outlook })]
		);
		vi.mocked(removeLessSignificantHighlights).mockImplementation(
			(highlights) => highlights
		);
		vi.mocked(combineSimilarHighlights).mockImplementation((highlights) =>
			highlights.map((highlight) =>
				combinedHighlight({ species: highlight.species ?? undefined })
			)
		);
		vi.mocked(sortHighlights).mockImplementation((highlights) => highlights);

		const result = await getAllHighlightsAcrossScopes(options);

		expect(getRawHighlightsOfTypeAcrossScopes).toHaveBeenCalledWith(
			expect.objectContaining({ outlook: 'inter' })
		);
		expect(getRawHighlightsOfTypeAcrossScopes).toHaveBeenCalledWith(
			expect.objectContaining({ outlook: 'intra' })
		);

		expect(result.inter.every((highlight) => highlight.species === 'inter')).toBe(
			true
		);
		expect(result.intra.every((highlight) => highlight.species === 'intra')).toBe(
			true
		);
		expect(result.inter.length).toBeGreaterThan(0);
		expect(result.intra.length).toBeGreaterThan(0);
	});
});
