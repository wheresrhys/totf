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
					{ time_period: '2020-03-01', value: 1 },
					{ time_period: '2020-04-01', value: 2 },
					{ time_period: '2021-03-01', value: 1 },
					{ time_period: '2021-04-01', value: 2 }
				],
				withSpecies: [
					{ time_period: '2020-03-01', value: 1, species_name: 'cat' },
					{ time_period: '2020-04-01', value: 2, species_name: 'dog' },
					{ time_period: '2021-03-01', value: 1, species_name: 'fish' },
					{ time_period: '2021-04-01', value: 2, species_name: 'tortoise' }
				],
				bySpecies: {
					cat: [{ time_period: '2020-03-01', value: 1, species_name: 'cat' }],
					dog: [{ time_period: '2020-04-01', value: 2, species_name: 'dog' }],
					fish: [{ time_period: '2021-03-01', value: 1, species_name: 'fish' }],
					tortoise: [
						{ time_period: '2021-04-01', value: 2, species_name: 'tortoise' }
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
					{ time_period: '2020-03-01', value: 1 },
					{ time_period: '2020-04-01', value: 2 }
				],
				withSpecies: [
					{ time_period: '2020-03-01', value: 1, species_name: 'cat' },
					{ time_period: '2020-04-01', value: 2, species_name: 'dog' }
				],
				bySpecies: {
					cat: [{ time_period: '2020-03-01', value: 1, species_name: 'cat' }],
					dog: [{ time_period: '2020-04-01', value: 2, species_name: 'dog' }]
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
					{ time_period: '2020-03-01', value: 1 },
					{ time_period: '2021-03-01', value: 1 }
				],
				withSpecies: [
					{ time_period: '2020-03-01', value: 1, species_name: 'cat' },
					{ time_period: '2021-03-01', value: 1, species_name: 'fish' }
				],
				bySpecies: {
					cat: [{ time_period: '2020-03-01', value: 1, species_name: 'cat' }],
					fish: [{ time_period: '2021-03-01', value: 1, species_name: 'fish' }]
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
				overall: [{ time_period: '2020-03-01', value: 1 }],
				withSpecies: [
					{ time_period: '2020-03-01', value: 1, species_name: 'cat' }
				],
				bySpecies: {
					cat: [{ time_period: '2020-03-01', value: 1, species_name: 'cat' }]
				}
			});
		});
	});

	describe('rule execution', () => {
		it('can opt to skip a rule based on timePeriod', async () => {});
		it('can opt to skip a rule based on parentWindow', async () => {});
		it('combines rule with parameters into a HighlightsOfType object', async () => {});
		it('applies limit passed in as parameter to trim rule output', async () => {});
		it("applies rule's own limit to output", async () => {});
		it("applies minimum of parameter and rule's own limit if both provided", async () => {});
		it('can execute against the withSpecies stats array', async () => {});
		it('can execute against the bySpecies stats map', async () => {});
		it('can opt out of executing bySpecies rules', async () => {});
		it('applies minimum limit to bySpecies rules too', async () => {});
		it('safely combines bySpecies and ordinary rules', async () => {});
	});
});
