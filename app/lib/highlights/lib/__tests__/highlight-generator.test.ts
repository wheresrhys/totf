import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HighlightsGenerator } from '../../types';
import type { CoreStatsResult, BiometricsStatsResult } from '@/app/models/db';
vi.mock('../../rules', () => ({ highlightRules: [] }));
vi.mock('@/app/actions/stats-cache', () => ({
	getStatsByTemporalUnit: vi.fn()
}));
import { getStatsByTemporalUnit } from '@/app/actions/stats-cache';
import { highlightRules } from '../../rules';
// a dummy rule that just reports what stats it was called with
import { getHighlightsWithinTimeWindow } from '../highlight-generator';

describe('highlight-generator', () => {
	beforeEach(() => {
		highlightRules.length = 0;
		vi.clearAllMocks();
	});
	// Note - for now caching behaviour is not tested
	describe('underlying data fetching', () => {
		const reporterRule = {
			statsSelector: 'coreStats',
			descriptor: {
				type: 'a',
				unit: 'bird',
				category: 'biometrics'
			},
			formatters: {
				highlightListPrefixPrinter: vi.fn(),
				combinedHighlightPrinter: vi.fn()
			},
			generator: vi.fn().mockReturnValue([])
		} as HighlightsGenerator;
		beforeEach(() => {
			highlightRules.push(reporterRule);
		});
		beforeEach(() => {
			vi.clearAllMocks();
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				coreStats: [
					{ time_period: '2020-03-01', bird_count: 1 },
					{ time_period: '2020-04-01', bird_count: 2 },
					{ time_period: '2021-03-01', bird_count: 1 },
					{ time_period: '2021-04-01', bird_count: 2 }
				] as CoreStatsResult[],
				coreStatsWithSpecies: [
					{ time_period: '2020-03-01', bird_count: 1, species_name: 'cat' },
					{ time_period: '2020-04-01', bird_count: 2, species_name: 'dog' },
					{ time_period: '2021-03-01', bird_count: 1, species_name: 'fish' },
					{ time_period: '2021-04-01', bird_count: 2, species_name: 'owl' }
				] as CoreStatsResult[],
				biometricsStatsWithSpecies: [
					{ time_period: '2020-03-01', max_wing: 1, species_name: 'cat' },
					{ time_period: '2020-04-01', max_wing: 2, species_name: 'dog' },
					{ time_period: '2021-03-01', max_wing: 1, species_name: 'fish' },
					{ time_period: '2021-04-01', max_wing: 2, species_name: 'owl' }
				] as BiometricsStatsResult[]
			});
		});
		it('fetches stats for the temporal unit provided', async () => {
			await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 1,
				includePerSpecies: true
			});
			expect(getStatsByTemporalUnit).toHaveBeenCalledOnce();
			expect(getStatsByTemporalUnit).toHaveBeenCalledWith('day', 1);
		});
		it('returns all stats by default', async () => {
			await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 2,
				includePerSpecies: true
			});
			expect(reporterRule.generator).toHaveBeenCalledWith([
				{ time_period: '2020-03-01', bird_count: 1 },
				{ time_period: '2020-04-01', bird_count: 2 },
				{ time_period: '2021-03-01', bird_count: 1 },
				{ time_period: '2021-04-01', bird_count: 2 }
			]);
		});
		it('filters correctly for a year window', async () => {
			await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 3,
				includePerSpecies: true,
				parentTimeWindow: { year: 2020 }
			});
			expect(reporterRule.generator).toHaveBeenCalledWith([
				{ time_period: '2020-03-01', bird_count: 1 },
				{ time_period: '2020-04-01', bird_count: 2 }
			]);
		});
		it('filters correctly for a month window', async () => {
			await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 4,
				includePerSpecies: true,
				parentTimeWindow: { month: 3 }
			});
			expect(reporterRule.generator).toHaveBeenCalledWith([
				{ time_period: '2020-03-01', bird_count: 1 },
				{ time_period: '2021-03-01', bird_count: 1 }
			]);
		});
		it('filters correctly for a year and month window', async () => {
			await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 5,
				includePerSpecies: true,
				parentTimeWindow: { year: 2020, month: 3 }
			});
			expect(reporterRule.generator).toHaveBeenCalledWith([
				{ time_period: '2020-03-01', bird_count: 1 }
			]);
		});
	});

	describe('rule execution', () => {
		function makeRow(
			time_period: string,
			bird_count: number,
			species_name: string | null = null
		) {
			return { time_period, bird_count, species_name } as CoreStatsResult;
		}

		const sortDescByBirdCount = (rows: CoreStatsResult[]) =>
			rows
				.map((r) => ({
					timePeriod: r.time_period as string,
					value: r.bird_count as number,
					species: r.species_name ?? null
				}))
				.sort((a, b) => b.value - a.value);

		function makeRule(
			overrides: Partial<HighlightsGenerator> = {}
		): HighlightsGenerator {
			return {
				statsSelector: 'coreStats',
				descriptor: { type: 'test', unit: 'bird', category: 'count' },
				formatters: {
					highlightListPrefixPrinter: () => '',
					combinedHighlightPrinter: () => ''
				},
				generator: sortDescByBirdCount,
				...overrides
			} as HighlightsGenerator;
		}

		it('can opt to skip a rule based on timePeriod', async () => {
			const rule = makeRule({
				condition: (temporalUnit) => temporalUnit !== 'day'
			});
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				coreStats: [makeRow('2020-01-01', 5)],
				coreStatsWithSpecies: [],
				biometricsStatsWithSpecies: []
			});

			const result = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 6,
				includePerSpecies: true
			});

			expect(result).toEqual([]);
		});

		it('can opt to skip a rule based on parentWindow', async () => {
			const rule = makeRule({
				condition: (_temporalUnit, parentTimeWindow) => !parentTimeWindow?.month
			});
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				coreStats: [makeRow('2020-01-01', 5)],
				coreStatsWithSpecies: [],
				biometricsStatsWithSpecies: []
			});

			const result = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 7,
				includePerSpecies: true,
				parentTimeWindow: { month: 3 }
			});

			expect(result).toEqual([]);
		});

		it('combines rule with parameters into a HighlightsOfType object', async () => {
			const rule = makeRule();
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				coreStats: [makeRow('2020-01-01', 5)],
				coreStatsWithSpecies: [],
				biometricsStatsWithSpecies: []
			});

			const result = await getHighlightsWithinTimeWindow({
				temporalUnit: 'month',
				groupId: 8,
				includePerSpecies: true
			});

			expect(result[0]).toMatchObject({
				descriptor: rule.descriptor,
				formatters: rule.formatters,
				scope: { temporalUnit: 'month', parentTimeWindow: undefined },
				values: [{ timePeriod: '2020-01-01', value: 5, species: null }]
			});
		});

		it('applies limit passed in as parameter to trim rule output', async () => {
			const rule = makeRule();
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				coreStats: [
					makeRow('2020-01-01', 5),
					makeRow('2020-01-02', 4),
					makeRow('2020-01-03', 3),
					makeRow('2020-01-04', 2),
					makeRow('2020-01-05', 1)
				],
				coreStatsWithSpecies: [],
				biometricsStatsWithSpecies: []
			});

			const result = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 9,
				includePerSpecies: true,
				limit: 2
			});

			expect(result[0].values.map((v) => v.value)).toEqual([5, 4]);
		});

		it("applies rule's own limit to output", async () => {
			const rule = makeRule({ limit: 2 });
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				coreStats: [
					makeRow('2020-01-01', 5),
					makeRow('2020-01-02', 4),
					makeRow('2020-01-03', 3),
					makeRow('2020-01-04', 2),
					makeRow('2020-01-05', 1)
				],
				coreStatsWithSpecies: [],
				biometricsStatsWithSpecies: []
			});

			const result = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 10,
				includePerSpecies: true,
				limit: 10
			});

			expect(result[0].values.map((v) => v.value)).toEqual([5, 4]);
		});

		it("applies minimum of parameter and rule's own limit if both provided", async () => {
			const rule = makeRule({ limit: 3 });
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				coreStats: [
					makeRow('2020-01-01', 5),
					makeRow('2020-01-02', 4),
					makeRow('2020-01-03', 3),
					makeRow('2020-01-04', 2),
					makeRow('2020-01-05', 1)
				],
				coreStatsWithSpecies: [],
				biometricsStatsWithSpecies: []
			});

			const smallerParam = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 11,
				includePerSpecies: true,
				limit: 1
			});
			expect(smallerParam[0].values.map((v) => v.value)).toEqual([5]);

			const smallerRuleLimit = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 12,
				includePerSpecies: true,
				limit: 5
			});
			expect(smallerRuleLimit[0].values.map((v) => v.value)).toEqual([5, 4, 3]);
		});

		it('can execute against the coreStatsWithSpecies stats array', async () => {
			const rule = makeRule({
				statsSelector: 'coreStatsWithSpecies'
			});
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				coreStats: [],
				coreStatsWithSpecies: [
					makeRow('2020-01-01', 2, 'cat'),
					makeRow('2020-01-02', 1, 'dog')
				],
				biometricsStatsWithSpecies: []
			});

			const result = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 13,
				includePerSpecies: true
			});

			expect(result).toHaveLength(1);
			expect(result[0].scope.species).toBeUndefined();
			expect(result[0].values.map((v) => v.species)).toEqual(['cat', 'dog']);
		});

		it('can execute against the coreStatsBySpecies stats map', async () => {
			const rule = makeRule({
				statsSelector: 'coreStatsBySpecies'
			});
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				coreStats: [],
				coreStatsWithSpecies: [
					makeRow('2020-01-01', 2, 'cat'),
					makeRow('2020-01-02', 1, 'dog')
				],
				biometricsStatsWithSpecies: []
			});

			const result = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 14,
				includePerSpecies: true
			});

			expect(result).toHaveLength(2);
			expect(result.map((r) => r.scope.species)).toEqual(['cat', 'dog']);
			expect(result[0].values[0].value).toBe(2);
			expect(result[1].values[0].value).toBe(1);
		});

		it('can opt out of executing coreStatsBySpecies rules', async () => {
			const rule = makeRule({
				statsSelector: 'coreStatsBySpecies'
			});
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				coreStats: [],
				coreStatsWithSpecies: [makeRow('2020-01-01', 2, 'cat')],
				biometricsStatsWithSpecies: []
			});

			const result = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 15,
				includePerSpecies: false
			});

			expect(result).toEqual([]);
		});

		it('applies minimum limit to coreStatsBySpecies rules too', async () => {
			const rule = makeRule({
				statsSelector: 'coreStatsBySpecies',
				limit: 1
			});
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				coreStats: [],
				coreStatsWithSpecies: [
					makeRow('2020-01-01', 3, 'cat'),
					makeRow('2020-01-02', 2, 'cat'),
					makeRow('2020-01-03', 1, 'cat')
				],
				biometricsStatsWithSpecies: []
			});

			const smallerRuleLimit = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 16,
				includePerSpecies: true,
				limit: 5
			});
			expect(smallerRuleLimit[0].values.map((v) => v.value)).toEqual([3]);

			const smallerParam = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 17,
				includePerSpecies: true,
				limit: 1
			});
			expect(smallerParam[0].values.map((v) => v.value)).toEqual([3]);
		});

		it('safely combines coreStatsBySpecies and ordinary rules', async () => {
			const coreStatsRule = makeRule();
			const coreStatsBySpeciesRule = makeRule({
				statsSelector: 'coreStatsBySpecies'
			});
			highlightRules.push(coreStatsRule, coreStatsBySpeciesRule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				coreStats: [makeRow('2020-01-01', 9)],
				coreStatsWithSpecies: [
					makeRow('2020-01-01', 2, 'cat'),
					makeRow('2020-01-02', 1, 'dog')
				],
				biometricsStatsWithSpecies: []
			});

			const result = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 18,
				includePerSpecies: true
			});

			expect(result).toHaveLength(3);
			expect(result[0].scope.species).toBeUndefined();
			expect(result[0].values[0].value).toBe(9);
			expect(result[1].scope.species).toBe('cat');
			expect(result[2].scope.species).toBe('dog');
		});
	});
});
