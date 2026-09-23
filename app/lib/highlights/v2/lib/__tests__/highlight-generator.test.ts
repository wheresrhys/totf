import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HighlightsGenerator } from '../../types';
import type { StatsRepository } from '@/app/actions/stats-cache';
import type { CoreStatsResult } from '@/app/models/db';
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
			statsSelector: vi.fn(),
			descriptor: {
				type: 'a',
				unit: 'bird',
				category: 'biometrics'
			},
			formatters: {
				highlightListPrefixPrinter: vi.fn(),
				combinedHighlightPrinter: vi.fn()
			},
			generator: () => []
		} as HighlightsGenerator;
		beforeEach(() => {
			highlightRules.push(reporterRule);
			vi.mocked(reporterRule.statsSelector).mockImplementation(
				(stats: StatsRepository<CoreStatsResult>) => stats.overall
			);
		});
		beforeEach(() => {
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				overall: [
					{ time_period: '2020-03-01', bird_count: 1 },
					{ time_period: '2020-04-01', bird_count: 2 },
					{ time_period: '2021-03-01', bird_count: 1 },
					{ time_period: '2021-04-01', bird_count: 2 }
				] as CoreStatsResult[],
				withSpecies: [
					{ time_period: '2020-03-01', bird_count: 1, species_name: 'cat' },
					{ time_period: '2020-04-01', bird_count: 2, species_name: 'dog' },
					{ time_period: '2021-03-01', bird_count: 1, species_name: 'fish' },
					{ time_period: '2021-04-01', bird_count: 2, species_name: 'tortoise' }
				] as CoreStatsResult[],
				bySpecies: {
					cat: [
						{ time_period: '2020-03-01', bird_count: 1, species_name: 'cat' }
					] as CoreStatsResult[],
					dog: [
						{ time_period: '2020-04-01', bird_count: 2, species_name: 'dog' }
					] as CoreStatsResult[],
					fish: [
						{ time_period: '2021-03-01', bird_count: 1, species_name: 'fish' }
					] as CoreStatsResult[],
					tortoise: [
						{
							time_period: '2021-04-01',
							bird_count: 2,
							species_name: 'tortoise'
						}
					] as CoreStatsResult[]
				}
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
			expect(reporterRule.statsSelector).toHaveBeenCalledWith({
				overall: [
					{ time_period: '2020-03-01', bird_count: 1 },
					{ time_period: '2020-04-01', bird_count: 2 },
					{ time_period: '2021-03-01', bird_count: 1 },
					{ time_period: '2021-04-01', bird_count: 2 }
				],
				withSpecies: [
					{ time_period: '2020-03-01', bird_count: 1, species_name: 'cat' },
					{ time_period: '2020-04-01', bird_count: 2, species_name: 'dog' },
					{ time_period: '2021-03-01', bird_count: 1, species_name: 'fish' },
					{ time_period: '2021-04-01', bird_count: 2, species_name: 'tortoise' }
				],
				bySpecies: {
					cat: [
						{ time_period: '2020-03-01', bird_count: 1, species_name: 'cat' }
					],
					dog: [
						{ time_period: '2020-04-01', bird_count: 2, species_name: 'dog' }
					],
					fish: [
						{ time_period: '2021-03-01', bird_count: 1, species_name: 'fish' }
					],
					tortoise: [
						{
							time_period: '2021-04-01',
							bird_count: 2,
							species_name: 'tortoise'
						}
					]
				}
			});
		});
		it('filters correctly for a year window', async () => {
			await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 3,
				includePerSpecies: true,
				parentTimeWindow: { year: 2020 }
			});
			expect(reporterRule.statsSelector).toHaveBeenCalledWith({
				overall: [
					{ time_period: '2020-03-01', bird_count: 1 },
					{ time_period: '2020-04-01', bird_count: 2 }
				],
				withSpecies: [
					{ time_period: '2020-03-01', bird_count: 1, species_name: 'cat' },
					{ time_period: '2020-04-01', bird_count: 2, species_name: 'dog' }
				],
				bySpecies: {
					cat: [
						{ time_period: '2020-03-01', bird_count: 1, species_name: 'cat' }
					],
					dog: [
						{ time_period: '2020-04-01', bird_count: 2, species_name: 'dog' }
					]
				}
			});
		});
		it('filters correctly for a month window', async () => {
			await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 4,
				includePerSpecies: true,
				parentTimeWindow: { month: 3 }
			});
			expect(reporterRule.statsSelector).toHaveBeenCalledWith({
				overall: [
					{ time_period: '2020-03-01', bird_count: 1 },
					{ time_period: '2021-03-01', bird_count: 1 }
				],
				withSpecies: [
					{ time_period: '2020-03-01', bird_count: 1, species_name: 'cat' },
					{ time_period: '2021-03-01', bird_count: 1, species_name: 'fish' }
				],
				bySpecies: {
					cat: [
						{ time_period: '2020-03-01', bird_count: 1, species_name: 'cat' }
					],
					fish: [
						{ time_period: '2021-03-01', bird_count: 1, species_name: 'fish' }
					]
				}
			});
		});
		it('filters correctly for a year and month window', async () => {
			await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 5,
				includePerSpecies: true,
				parentTimeWindow: { year: 2020, month: 3 }
			});
			expect(reporterRule.statsSelector).toHaveBeenCalledWith({
				overall: [{ time_period: '2020-03-01', bird_count: 1 }],
				withSpecies: [
					{ time_period: '2020-03-01', bird_count: 1, species_name: 'cat' }
				],
				bySpecies: {
					cat: [
						{ time_period: '2020-03-01', bird_count: 1, species_name: 'cat' }
					]
				}
			});
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
				statsSelector: (stats) => stats.overall,
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
				overall: [makeRow('2020-01-01', 5)],
				withSpecies: [],
				bySpecies: {}
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
				overall: [makeRow('2020-01-01', 5)],
				withSpecies: [],
				bySpecies: {}
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
				overall: [makeRow('2020-01-01', 5)],
				withSpecies: [],
				bySpecies: {}
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
				overall: [
					makeRow('2020-01-01', 5),
					makeRow('2020-01-02', 4),
					makeRow('2020-01-03', 3),
					makeRow('2020-01-04', 2),
					makeRow('2020-01-05', 1)
				],
				withSpecies: [],
				bySpecies: {}
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
				overall: [
					makeRow('2020-01-01', 5),
					makeRow('2020-01-02', 4),
					makeRow('2020-01-03', 3),
					makeRow('2020-01-04', 2),
					makeRow('2020-01-05', 1)
				],
				withSpecies: [],
				bySpecies: {}
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
				overall: [
					makeRow('2020-01-01', 5),
					makeRow('2020-01-02', 4),
					makeRow('2020-01-03', 3),
					makeRow('2020-01-04', 2),
					makeRow('2020-01-05', 1)
				],
				withSpecies: [],
				bySpecies: {}
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

		it('can execute against the withSpecies stats array', async () => {
			const rule = makeRule({ statsSelector: (stats) => stats.withSpecies });
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				overall: [],
				withSpecies: [
					makeRow('2020-01-01', 2, 'cat'),
					makeRow('2020-01-02', 1, 'dog')
				],
				bySpecies: {}
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

		it('can execute against the bySpecies stats map', async () => {
			const rule = makeRule({ statsSelector: (stats) => stats.bySpecies });
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				overall: [],
				withSpecies: [],
				bySpecies: {
					cat: [makeRow('2020-01-01', 2, 'cat')],
					dog: [makeRow('2020-01-02', 1, 'dog')]
				}
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

		it('can opt out of executing bySpecies rules', async () => {
			const rule = makeRule({ statsSelector: (stats) => stats.bySpecies });
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				overall: [],
				withSpecies: [],
				bySpecies: {
					cat: [makeRow('2020-01-01', 2, 'cat')]
				}
			});

			const result = await getHighlightsWithinTimeWindow({
				temporalUnit: 'day',
				groupId: 15,
				includePerSpecies: false
			});

			expect(result).toEqual([]);
		});

		it('applies minimum limit to bySpecies rules too', async () => {
			const rule = makeRule({
				statsSelector: (stats) => stats.bySpecies,
				limit: 1
			});
			highlightRules.push(rule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				overall: [],
				withSpecies: [],
				bySpecies: {
					cat: [
						makeRow('2020-01-01', 3, 'cat'),
						makeRow('2020-01-02', 2, 'cat'),
						makeRow('2020-01-03', 1, 'cat')
					]
				}
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

		it('safely combines bySpecies and ordinary rules', async () => {
			const overallRule = makeRule();
			const bySpeciesRule = makeRule({
				statsSelector: (stats) => stats.bySpecies
			});
			highlightRules.push(overallRule, bySpeciesRule);
			vi.mocked(getStatsByTemporalUnit).mockResolvedValue({
				overall: [makeRow('2020-01-01', 9)],
				withSpecies: [],
				bySpecies: {
					cat: [makeRow('2020-01-01', 2, 'cat')],
					dog: [makeRow('2020-01-02', 1, 'dog')]
				}
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
