import { describe, it, expect } from 'vitest';

import {
	getTimePeriodSampler,
	filterStats,
	getTemporalUnitFromTimeWindow,
	sortByPositionAndTimeWindow,
	limitHighlights,
	type PositionAndTimeWindow
} from '../highlight-utils';
import type {
	HighlightsGenerator,
	HighlightScope,
	HighlightValue
} from '../../types';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { StatsResult } from '@/modules/stats';

describe('getTimePeriodSampler', () => {
	it('returns an always-true filter when no timePeriod is given', () => {
		const sampler = getTimePeriodSampler();

		expect(sampler('2020-05-15')).toBe(true);
		expect(sampler('anything-at-all')).toBe(true);
	});

	it('returns an exact timePeriod match filter when timePeriod is given with no timeWindow', () => {
		const sampler = getTimePeriodSampler('2020-05-15');

		expect(sampler('2020-05-15')).toBe(true);
		expect(sampler('2020-05-16')).toBe(false);
	});

	it('returns a time-window filter (delegating to buildTimeWindowFilter) when timeWindow is given', () => {
		const sampler = getTimePeriodSampler('this-value-is-ignored', {
			year: 2020,
			month: 5
		});

		expect(sampler('2020-05-10')).toBe(true);
		expect(sampler('2020-06-10')).toBe(false);
	});
});

describe('filterStats', () => {
	const statRow = (timePeriod: string, speciesName: string | null) =>
		({
			time_period: timePeriod,
			species_name: speciesName
		}) as StatsResult;

	const rule = (speciesUsed: HighlightsGenerator['speciesUsed']) =>
		({ speciesUsed }) as HighlightsGenerator;

	const viewedGroup = (id: number): ViewedGroup => ({ id, slug: null });

	const scope = (
		overrides: Partial<HighlightScope> = {}
	): HighlightScope => ({
		temporalUnit: 'month',
		...overrides
	});

	it('filters baseData to rows within the parentTimeWindow and matching the given species', () => {
		const baseData = [
			statRow('2020-05-10', 'Blackbird'),
			statRow('2020-06-10', 'Blackbird'),
			statRow('2020-05-10', 'Robin')
		];

		const result = filterStats({
			rule: rule('present'),
			viewedGroup: viewedGroup(1101),
			scope: scope({
				parentTimeWindow: { year: 2020, month: 5 },
				species: 'Blackbird'
			}),
			baseData
		});

		expect(result).toStrictEqual([statRow('2020-05-10', 'Blackbird')]);
	});

	it('returns a cached result instead of recomputing for a repeat call with the same groupId/scope/speciesUsed', () => {
		const sharedViewedGroup = viewedGroup(2101);
		const sharedScope = scope({ species: 'Wren' });
		const sharedRule = rule('present');

		const firstResult = filterStats({
			rule: sharedRule,
			viewedGroup: sharedViewedGroup,
			scope: sharedScope,
			baseData: [statRow('2020-05-10', 'Wren')]
		});

		const secondResult = filterStats({
			rule: sharedRule,
			viewedGroup: sharedViewedGroup,
			scope: sharedScope,
			baseData: [statRow('2021-09-01', 'Nightingale')]
		});

		expect(secondResult).toStrictEqual(firstResult);
	});

	it('computes independently for a different groupId, scope, or speciesUsed', () => {
		const baseline = filterStats({
			rule: rule('present'),
			viewedGroup: viewedGroup(3101),
			scope: scope({ species: 'Wren' }),
			baseData: [statRow('2020-05-10', 'Wren')]
		});

		const differentGroupId = filterStats({
			rule: rule('present'),
			viewedGroup: viewedGroup(3102),
			scope: scope({ species: 'Wren' }),
			baseData: [statRow('2021-09-01', 'Nightingale')]
		});

		const differentScope = filterStats({
			rule: rule('present'),
			viewedGroup: viewedGroup(3101),
			scope: scope({ species: 'Robin' }),
			baseData: [statRow('2021-09-01', 'Nightingale')]
		});

		const differentSpeciesUsed = filterStats({
			rule: rule('grouped'),
			viewedGroup: viewedGroup(3101),
			scope: scope({ species: 'Wren' }),
			baseData: [statRow('2021-09-01', 'Nightingale')]
		});

		expect(differentGroupId).not.toStrictEqual(baseline);
		expect(differentScope).not.toStrictEqual(baseline);
		expect(differentSpeciesUsed).not.toStrictEqual(baseline);
	});
});

describe('getTemporalUnitFromTimeWindow', () => {
	it("returns 'month' when both year and month are set", () => {
		expect(getTemporalUnitFromTimeWindow({ year: 2020, month: 5 })).toBe(
			'month'
		);
	});

	it("returns 'year' when only year is set", () => {
		expect(getTemporalUnitFromTimeWindow({ year: 2020 })).toBe('year');
	});

	it("returns 'month-squashed' when only month is set", () => {
		expect(getTemporalUnitFromTimeWindow({ month: 5 })).toBe(
			'month-squashed'
		);
	});

	it("returns 'all-time' when neither is set", () => {
		expect(getTemporalUnitFromTimeWindow({})).toBe('all-time');
	});
});

describe('sortByPositionAndTimeWindow', () => {
	it('sorts a month+year window before a year-only window, regardless of position', () => {
		const monthYearWindow: PositionAndTimeWindow = {
			position: 1,
			window: { year: 2020, month: 5 }
		};
		const yearOnlyWindow: PositionAndTimeWindow = {
			position: 5,
			window: { year: 2020 }
		};

		expect(
			[monthYearWindow, yearOnlyWindow].sort(sortByPositionAndTimeWindow)
		).toStrictEqual([yearOnlyWindow, monthYearWindow]);
	});

	it('sorts a year-only window before a month-only window', () => {
		const yearOnlyWindow: PositionAndTimeWindow = {
			position: 1,
			window: { year: 2020 }
		};
		const monthOnlyWindow: PositionAndTimeWindow = {
			position: 1,
			window: { month: 5 }
		};

		expect(
			[monthOnlyWindow, yearOnlyWindow].sort(sortByPositionAndTimeWindow)
		).toStrictEqual([yearOnlyWindow, monthOnlyWindow]);
	});

	it('sorts a month-only window before an all-time (no window) entry', () => {
		const monthOnlyWindow: PositionAndTimeWindow = {
			position: 1,
			window: { month: 5 }
		};
		const allTimeWindow: PositionAndTimeWindow = {
			position: 1,
			window: undefined
		};

		expect(
			[monthOnlyWindow, allTimeWindow].sort(sortByPositionAndTimeWindow)
		).toStrictEqual([allTimeWindow, monthOnlyWindow]);
	});

	it('breaks a tie between equally-specific windows by ascending position', () => {
		const secondPlaceWindow: PositionAndTimeWindow = {
			position: 3,
			window: { year: 2020 }
		};
		const firstPlaceWindow: PositionAndTimeWindow = {
			position: 1,
			window: { year: 2021 }
		};

		expect(
			[secondPlaceWindow, firstPlaceWindow].sort(sortByPositionAndTimeWindow)
		).toStrictEqual([firstPlaceWindow, secondPlaceWindow]);
	});
});

describe('limitHighlights', () => {
	const textualHighlight = (timePeriod: string, value: string): HighlightValue => ({
		timePeriod,
		value,
		species: null
	});

	const numericHighlight = (
		timePeriod: string,
		value: number
	): HighlightValue => ({
		timePeriod,
		value,
		species: null
	});

	it('returns an empty array for an empty input', () => {
		expect(limitHighlights([], 3)).toStrictEqual([]);
	});

	it('assigns every highlight position 1 and isTied false when values are textual, not numeric', () => {
		const highlights = [
			textualHighlight('2020-05-01', 'Alpha'),
			textualHighlight('2020-05-02', 'Alpha'),
			textualHighlight('2020-05-03', 'Beta')
		];

		const result = limitHighlights(highlights, 2);

		expect(result).toStrictEqual(
			highlights.map((highlight) => ({
				...highlight,
				ranking: { position: 1, isTied: false }
			}))
		);
	});

	describe('numeric highlights', () => {
		it('keeps every highlight when there are no more than limit of them', () => {
			const highlights = [
				numericHighlight('2020-05-01', 50),
				numericHighlight('2020-05-02', 40),
				numericHighlight('2020-05-03', 30)
			];

			const result = limitHighlights(highlights, 5);

			expect(result.map(({ timePeriod }) => timePeriod)).toStrictEqual(
				highlights.map(({ timePeriod }) => timePeriod)
			);
		});

		it('cuts off at the limit when values are all distinct', () => {
			const highlights = [
				numericHighlight('2020-05-01', 50),
				numericHighlight('2020-05-02', 40),
				numericHighlight('2020-05-03', 30),
				numericHighlight('2020-05-04', 20),
				numericHighlight('2020-05-05', 10)
			];

			const result = limitHighlights(highlights, 3);

			expect(result.map(({ timePeriod }) => timePeriod)).toStrictEqual([
				'2020-05-01',
				'2020-05-02',
				'2020-05-03'
			]);
		});

		it('keeps every highlight tied with the value at the limit boundary, even past limit', () => {
			const highlights = [
				numericHighlight('2020-05-01', 50),
				numericHighlight('2020-05-02', 40),
				numericHighlight('2020-05-03', 40),
				numericHighlight('2020-05-04', 40),
				numericHighlight('2020-05-05', 10)
			];

			const result = limitHighlights(highlights, 3);

			expect(result.map(({ timePeriod }) => timePeriod)).toStrictEqual([
				'2020-05-01',
				'2020-05-02',
				'2020-05-03',
				'2020-05-04'
			]);
		});

		it('assigns position by rank of distinct value, not by row index', () => {
			const highlights = [
				numericHighlight('2020-05-01', 100),
				numericHighlight('2020-05-02', 80),
				numericHighlight('2020-05-03', 80),
				numericHighlight('2020-05-04', 50)
			];

			const result = limitHighlights(highlights, 4);

			expect(
				result.map(({ timePeriod, ranking }) => [
					timePeriod,
					ranking.position
				])
			).toStrictEqual([
				['2020-05-01', 1],
				['2020-05-02', 2],
				['2020-05-03', 2],
				['2020-05-04', 3]
			]);
		});

		it('marks isTied true for every highlight sharing a non-unique value', () => {
			const highlights = [
				numericHighlight('2020-05-01', 100),
				numericHighlight('2020-05-02', 80),
				numericHighlight('2020-05-03', 80),
				numericHighlight('2020-05-04', 50)
			];

			const result = limitHighlights(highlights, 4);

			expect(
				result.map(({ timePeriod, ranking }) => [
					timePeriod,
					ranking.isTied
				])
			).toStrictEqual([
				['2020-05-01', false],
				['2020-05-02', true],
				['2020-05-03', true],
				['2020-05-04', false]
			]);
		});
	});
});
