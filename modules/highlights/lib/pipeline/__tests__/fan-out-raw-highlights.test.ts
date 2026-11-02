import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRawHighlightsOfTypeAcrossScopes } from '../fan-out-raw-highlights';
import { getScopedHighlightsOfType } from '../fetch-scoped-stats';
import type {
	HighlightsOfTypeParams,
	NewHighlightValue
} from '../../../types';
import type { ViewedGroup } from '@/app/lib/group-slug';

// The only mocked boundary — everything else (rule registry, presence/time-window
// resolution) runs for real against the production rule definitions in
// `modules/highlights/rules/`.
vi.mock('../fetch-scoped-stats', () => ({
	getScopedHighlightsOfType: vi.fn()
}));

const viewedGroup: ViewedGroup = { id: 101, slug: null };

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

describe('getRawHighlightsOfTypeAcrossScopes', () => {
	beforeEach(() => {
		vi.mocked(getScopedHighlightsOfType).mockReset();
		vi.mocked(getScopedHighlightsOfType).mockResolvedValue([]);
	});

	it('returns an empty array without calling getScopedHighlightsOfType when the rule has no presence config for this temporal unit/outlook/species', async () => {
		// `birds` (birdCount) has presence.species === null — a species-scoped
		// request against it has no presence config at all.
		const result = await getRawHighlightsOfTypeAcrossScopes({
			highlightType: 'birds',
			timePeriod: '2020-05-01',
			temporalUnit: 'day',
			viewedGroup,
			outlook: 'inter',
			species: 'Robin'
		});

		expect(result).toStrictEqual([]);
		expect(getScopedHighlightsOfType).not.toHaveBeenCalled();
	});

	it('builds one scoped-fetch call per lake entry in the presence config, skipping any lake with a limit of 0', async () => {
		// `eachSpeciesCount`'s day/inter presence is a single config entry with
		// three lakes: allTime: 3, monthSquashed: 0, year: 1.
		await getRawHighlightsOfTypeAcrossScopes({
			highlightType: 'eachSpeciesCount',
			timePeriod: '2020-05-01',
			temporalUnit: 'day',
			viewedGroup,
			outlook: 'inter'
		});

		expect(getScopedHighlightsOfType).toHaveBeenCalledTimes(2);
		const limits = vi
			.mocked(getScopedHighlightsOfType)
			.mock.calls.map(([config]) => config.limit)
			.sort((a, b) => a - b);
		expect(limits).toStrictEqual([1, 3]);
	});

	it("derives each call's lakeTimeWindow from the lake's own temporal unit and samplesTimeWindow from the scope's temporal unit", async () => {
		// `birds`'s month/inter presence includes (among other entries) a
		// `{ sample: 'day', lakes: { year: 3 } }` config — its lake is scoped to
		// `year`, distinct from the overall scope's `month`.
		await getRawHighlightsOfTypeAcrossScopes({
			highlightType: 'birds',
			timePeriod: '2020-05-15',
			temporalUnit: 'month',
			viewedGroup,
			outlook: 'inter'
		});

		const configs = vi
			.mocked(getScopedHighlightsOfType)
			.mock.calls.map(([config]) => config);

		// samplesTimeWindow is derived from the scope's own temporal unit
		// ('month'), so it's the same for every call regardless of which lake
		// that call is for.
		configs.forEach((config) => {
			expect(config.samplesTimeWindow).toStrictEqual({ month: 5, year: 2020 });
		});

		// the config built from the `year` lake derives its lakeTimeWindow from
		// that lake's own temporal unit instead — distinct from samplesTimeWindow.
		const yearLakeConfig = configs.find(
			(config) =>
				config.temporalUnit === 'day' &&
				config.limit === 3 &&
				JSON.stringify(config.lakeTimeWindow) === JSON.stringify({ year: 2020 })
		);
		expect(yearLakeConfig).toBeDefined();
	});

	it('flattens the results of every scoped-fetch call into one array', async () => {
		// `singleSpeciesCount`'s day/inter presence is a single config entry
		// with two lakes: allTime: 3, year: 1 — two scoped-fetch calls.
		const allTimeResults = [buildHighlight({ timePeriod: 'all-time-hit' })];
		const yearResults = [
			buildHighlight({ timePeriod: 'year-hit-1' }),
			buildHighlight({ timePeriod: 'year-hit-2' })
		];
		vi.mocked(getScopedHighlightsOfType).mockImplementation(
			async (config: HighlightsOfTypeParams) =>
				config.limit === 3 ? allTimeResults : yearResults
		);

		const result = await getRawHighlightsOfTypeAcrossScopes({
			highlightType: 'singleSpeciesCount',
			timePeriod: '2020-05-01',
			temporalUnit: 'day',
			viewedGroup,
			outlook: 'inter'
		});

		expect(result).toStrictEqual([...allTimeResults, ...yearResults]);
	});
});
