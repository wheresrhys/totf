import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getScopedHighlightsOfType } from '../fetch-scoped-stats';
import { globalStatsCacheFetchPool } from '@/modules/stats/browser';
import type { StatsResult } from '@/modules/stats/browser';
import { getRule } from '../../rule-registry';
import type {
	HighlightsGenerator,
	HighlightValue,
	HighlightsOfTypeParams
} from '../../../types';
import type { ViewedGroup } from '@/app/lib/group-slug';

// Must stay `@/modules/stats/browser`, never the bare `@/modules/stats` barrel
// — see the matching comment in `../fetch-scoped-stats.ts`.
vi.mock('@/modules/stats/browser', () => ({
	globalStatsCacheFetchPool: { fetch: vi.fn() }
}));

vi.mock('../../rule-registry', () => ({
	getRule: vi.fn()
}));

// `filterStats` (exercised for real here, per the module boundary rule) keeps
// a module-level cache keyed by groupId+scope+speciesUsed that outlives any
// one test. A shared viewedGroup id across tests with the same scope would
// let an earlier test's (possibly empty) cached result leak into a later
// one, so every call gets its own fresh group id instead.
let nextGroupId = 9101;
function freshViewedGroup(): ViewedGroup {
	return { id: nextGroupId++, slug: 'test-group' };
}

function statsRow(overrides: Partial<StatsResult> = {}): StatsResult {
	return {
		time_period: '2020-05-01',
		species_name: null,
		bird_count: 1,
		...overrides
	} as StatsResult;
}

// A small hand-built rule whose generator deterministically produces a
// textual (non-numeric) highlight value per row, so `limitHighlights`'
// ranking logic (tested in its own suite) is a no-op here and these tests
// stay focused on `getScopedHighlightsOfType`'s own wiring.
function nonGroupedRule(
	overrides: Partial<HighlightsGenerator> = {}
): HighlightsGenerator {
	return {
		descriptor: { type: 'test-rule', unit: 'bird', category: 'count' },
		speciesUsed: 'none',
		generator: (stats: StatsResult[]): HighlightValue[] =>
			stats.map((row) => ({
				timePeriod: row.time_period,
				value: `value-for-${row.time_period}`,
				species: row.species_name
			})),
		...overrides
	} as HighlightsGenerator;
}

function groupedRule(
	overrides: Partial<HighlightsGenerator> = {}
): HighlightsGenerator {
	return {
		...nonGroupedRule(),
		speciesUsed: 'grouped',
		generator: (stats: StatsResult[]): HighlightValue[] =>
			stats.map((row) => ({
				timePeriod: row.time_period,
				value: `value-for-${row.species_name}`,
				species: row.species_name
			})),
		...overrides
	} as HighlightsGenerator;
}

function params(
	overrides: Partial<HighlightsOfTypeParams> = {}
): HighlightsOfTypeParams {
	return {
		highlightType: 'test-rule',
		viewedGroup: freshViewedGroup(),
		timePeriod: '',
		temporalUnit: 'month',
		limit: 10,
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(globalStatsCacheFetchPool.fetch).mockResolvedValue([]);
});

describe('getScopedHighlightsOfType', () => {
	describe('fetching the base stats from the cache pool', () => {
		it('fetches by species when a species is given, even for a rule that does not use species', async () => {
			vi.mocked(getRule).mockReturnValue(nonGroupedRule());

			await getScopedHighlightsOfType(params({ species: 'Blackbird' }));

			expect(globalStatsCacheFetchPool.fetch).toHaveBeenCalledWith(
				expect.objectContaining({ bySpecies: true })
			);
		});

		it("fetches by species when no species is given but the rule's speciesUsed is not 'none'", async () => {
			vi.mocked(getRule).mockReturnValue(groupedRule());

			await getScopedHighlightsOfType(params());

			expect(globalStatsCacheFetchPool.fetch).toHaveBeenCalledWith(
				expect.objectContaining({ bySpecies: true })
			);
		});

		it("fetches the whole group when no species is given and the rule's speciesUsed is 'none'", async () => {
			vi.mocked(getRule).mockReturnValue(nonGroupedRule());

			await getScopedHighlightsOfType(params());

			expect(globalStatsCacheFetchPool.fetch).toHaveBeenCalledWith(
				expect.objectContaining({ bySpecies: false })
			);
		});
	});

	describe('a speciesUsed: grouped rule', () => {
		beforeEach(() => {
			vi.mocked(getRule).mockReturnValue(groupedRule());
			vi.mocked(globalStatsCacheFetchPool.fetch).mockResolvedValue([
				statsRow({ time_period: '2020-05-01', species_name: 'Blackbird' }),
				statsRow({ time_period: '2020-05-02', species_name: 'Robin' })
			]);
		});

		it('groups the filtered stats by species_name and returns one highlights call per distinct species, flattened into one array', async () => {
			const result = await getScopedHighlightsOfType(params());

			expect(result.map((h) => h.value).toSorted()).toStrictEqual(
				['value-for-Blackbird', 'value-for-Robin'].toSorted()
			);
		});

		it("tags each species group's highlights with its own scope.species", async () => {
			const result = await getScopedHighlightsOfType(params());

			expect(result.map((h) => h.scope.species).toSorted()).toStrictEqual(
				['Blackbird', 'Robin']
			);
		});
	});

	describe('a non-grouped rule', () => {
		beforeEach(() => {
			vi.mocked(getRule).mockReturnValue(nonGroupedRule());
			vi.mocked(globalStatsCacheFetchPool.fetch).mockResolvedValue([
				statsRow({ time_period: '2020-05-01', species_name: 'Blackbird' }),
				statsRow({ time_period: '2020-05-02', species_name: 'Robin' })
			]);
		});

		it('makes exactly one highlights call scoped to the whole group, with no species on the scope', async () => {
			const result = await getScopedHighlightsOfType(params());

			expect(result).toHaveLength(2);
			expect(result.every((h) => h.scope.species === undefined)).toBe(true);
		});

		it("returns that single call's result directly, not grouped by species", async () => {
			const result = await getScopedHighlightsOfType(params());

			expect(result.map((h) => h.value)).toStrictEqual([
				'value-for-2020-05-01',
				'value-for-2020-05-02'
			]);
		});
	});
});
