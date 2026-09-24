import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
	HighlightsOfType,
	HighlightValue,
	HighlightCategory,
	YearMonthRestriction
} from '../../types';
import type {
	StatUnit,
	TemporalUnit
} from '@/app/components/shared/StatOutput';
// mock getHighlightsWithinTimeWindow
vi.mock('../highlight-generator', () => ({
	getHighlightsWithinTimeWindow: vi.fn()
}));
import { getHighlightsWithinTimeWindow } from '../highlight-generator';
import { getCondensedHighlightsAtTimePeriod } from '../time-period-highlights';

const GROUP_ID = 1;
const DAY_PERIOD = '2024-03-15';
const MONTH_PERIOD = '2024-03';
const YEAR_PERIOD = '2024';

const callForDay = () =>
	getCondensedHighlightsAtTimePeriod(GROUP_ID, DAY_PERIOD, 'day');
const callForMonth = () =>
	getCondensedHighlightsAtTimePeriod(GROUP_ID, MONTH_PERIOD, 'month');
const callForYear = () =>
	getCondensedHighlightsAtTimePeriod(GROUP_ID, YEAR_PERIOD, 'year');

function makeValue(
	timePeriod: string,
	value: number,
	species: string | null = null
): HighlightValue {
	return { timePeriod, value, species };
}

// a lone value is always ranked position 1, not tied
function singleValue(
	timePeriod: string,
	value: number,
	species: string | null = null
) {
	return [makeValue(timePeriod, value, species)];
}

// pads the sibling array with an equal decoy value so the target ties for position 1
function tiedValue(
	timePeriod: string,
	value: number,
	species: string | null = null
) {
	return [
		makeValue(timePeriod, value, species),
		makeValue('decoy', value, species)
	];
}

// pads the sibling array with a bigger decoy value so the target ranks position 2, not tied
function secondPlaceValue(
	timePeriod: string,
	value: number,
	species: string | null = null
) {
	return [
		makeValue('decoy', value + 1000, species),
		makeValue(timePeriod, value, species)
	];
}

function makeHighlightsOfType({
	type = 'test',
	category = 'count',
	unit = 'bird',
	temporalUnit = 'year',
	parentTimeWindow,
	species,
	values
}: {
	type?: string;
	category?: HighlightCategory;
	unit?: StatUnit;
	temporalUnit?: TemporalUnit;
	parentTimeWindow?: YearMonthRestriction;
	species?: string;
	values: HighlightValue[];
}): HighlightsOfType {
	return {
		formatters: {
			highlightListPrefixPrinter: vi.fn(),
			combinedHighlightPrinter: vi.fn()
		},
		descriptor: { category, type, unit },
		scope: { temporalUnit, parentTimeWindow, species },
		values
	};
}

// whether the result contains a highlight with a scope carrying this window key,
// at any depth of its combined `scopes` - used to check survival past significance filtering
function survivesWithWindow(
	result: Awaited<ReturnType<typeof getCondensedHighlightsAtTimePeriod>>,
	windowKey: 'year' | 'month'
) {
	return result.some((highlight) =>
		highlight.scopes.some(
			(s) => s.scope.parentTimeWindow?.[windowKey] !== undefined
		)
	);
}

describe('getHighlightsWithinTimeWindow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('data sources', () => {
		describe('day', () => {
			it('combines all time, year and month highlights', async () => {
				vi.mocked(getHighlightsWithinTimeWindow).mockImplementation(
					async ({ parentTimeWindow }) => {
						if (parentTimeWindow?.month) {
							return [
								makeHighlightsOfType({
									type: 'month-rule',
									temporalUnit: 'day',
									parentTimeWindow,
									values: singleValue(DAY_PERIOD, 1)
								})
							];
						}
						if (parentTimeWindow?.year) {
							return [
								makeHighlightsOfType({
									type: 'year-rule',
									temporalUnit: 'day',
									parentTimeWindow,
									values: singleValue(DAY_PERIOD, 1)
								})
							];
						}
						return [
							makeHighlightsOfType({
								type: 'all-time-rule',
								temporalUnit: 'day',
								values: singleValue(DAY_PERIOD, 1)
							})
						];
					}
				);

				const result = await callForDay();

				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledTimes(3);
				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledWith({
					temporalUnit: 'day',
					groupId: GROUP_ID,
					limit: 3,
					includePerSpecies: true
				});
				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledWith({
					temporalUnit: 'day',
					groupId: GROUP_ID,
					parentTimeWindow: { year: 2024 },
					limit: 1,
					includePerSpecies: true
				});
				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledWith({
					temporalUnit: 'day',
					groupId: GROUP_ID,
					parentTimeWindow: { month: 3 },
					limit: 3,
					includePerSpecies: true
				});
				expect(result.map((r) => r.descriptor.type).sort()).toEqual([
					'all-time-rule',
					'month-rule',
					'year-rule'
				]);
			});

			it('filters out highlights that do not occur on the relevant day', async () => {
				vi.mocked(getHighlightsWithinTimeWindow).mockImplementation(
					async ({ parentTimeWindow }) => {
						if (parentTimeWindow) return [];
						return [
							makeHighlightsOfType({
								type: 'matches',
								values: [makeValue('2024-03-14', 5), makeValue(DAY_PERIOD, 9)]
							}),
							makeHighlightsOfType({
								type: 'no-match',
								values: [makeValue('2024-03-01', 2), makeValue('2024-04-01', 4)]
							})
						];
					}
				);

				const result = await callForDay();

				expect(result.map((r) => r.descriptor.type)).toEqual(['matches']);
				expect(result[0].value.value).toBe(9);
			});
		});

		describe('month', () => {
			it('combines all time and year highlights when calculating for a month', async () => {
				vi.mocked(getHighlightsWithinTimeWindow).mockImplementation(
					async ({ parentTimeWindow }) => {
						if (parentTimeWindow?.year) {
							return [
								makeHighlightsOfType({
									type: 'year-rule',
									temporalUnit: 'month',
									parentTimeWindow,
									values: singleValue(MONTH_PERIOD, 1)
								})
							];
						}
						return [
							makeHighlightsOfType({
								type: 'all-time-rule',
								temporalUnit: 'month',
								values: singleValue(MONTH_PERIOD, 1)
							})
						];
					}
				);

				const result = await callForMonth();

				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledTimes(2);
				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledWith({
					temporalUnit: 'month',
					groupId: GROUP_ID,
					limit: 3,
					includePerSpecies: true
				});
				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledWith({
					temporalUnit: 'month',
					groupId: GROUP_ID,
					parentTimeWindow: { year: 2024 },
					limit: 1,
					includePerSpecies: true
				});
				expect(result.map((r) => r.descriptor.type).sort()).toEqual([
					'all-time-rule',
					'year-rule'
				]);
			});

			it('filters out highlights that do not occur in the relevant month', async () => {
				vi.mocked(getHighlightsWithinTimeWindow).mockImplementation(
					async ({ parentTimeWindow }) => {
						if (parentTimeWindow) return [];
						return [
							makeHighlightsOfType({
								type: 'matches',
								values: [makeValue('2024-02', 5), makeValue(MONTH_PERIOD, 9)]
							}),
							makeHighlightsOfType({
								type: 'no-match',
								values: [makeValue('2024-01', 2), makeValue('2024-04', 4)]
							})
						];
					}
				);

				const result = await callForMonth();

				expect(result.map((r) => r.descriptor.type)).toEqual(['matches']);
				expect(result[0].value.value).toBe(9);
			});
		});

		describe('year', () => {
			it('fetches all time highlights when calculating for a year', async () => {
				vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
					makeHighlightsOfType({ values: singleValue(YEAR_PERIOD, 7) })
				]);

				const result = await callForYear();

				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledTimes(1);
				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledWith({
					temporalUnit: 'year',
					groupId: GROUP_ID,
					limit: 3,
					includePerSpecies: true
				});
				expect(result[0].value.value).toBe(7);
			});

			it('filters out highlights that do not occur in the relevant year', async () => {
				vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
					makeHighlightsOfType({
						type: 'matches',
						values: [makeValue('2023', 5), makeValue(YEAR_PERIOD, 9)]
					}),
					makeHighlightsOfType({
						type: 'no-match',
						values: [makeValue('2022', 2), makeValue('2021', 4)]
					})
				]);

				const result = await callForYear();

				expect(result.map((r) => r.descriptor.type)).toEqual(['matches']);
				expect(result[0].value.value).toBe(9);
			});
		});
	});

	describe('filtering based on significance', () => {
		// harness for tests using temporalUnit 'month' (all-time + year tiers only)
		function mockAllTimeAndYear(
			allTime: HighlightsOfType,
			year: HighlightsOfType
		) {
			vi.mocked(getHighlightsWithinTimeWindow).mockImplementation(
				async ({ parentTimeWindow }) => {
					if (parentTimeWindow?.year) return [year];
					return [allTime];
				}
			);
		}

		// harness for tests using temporalUnit 'day', populating only the two tiers under test
		function mockTwoOfThreeTiers(tiers: {
			allTime?: HighlightsOfType;
			year?: HighlightsOfType;
			month?: HighlightsOfType;
		}) {
			vi.mocked(getHighlightsWithinTimeWindow).mockImplementation(
				async ({ parentTimeWindow }) => {
					if (parentTimeWindow?.month) return tiers.month ? [tiers.month] : [];
					if (parentTimeWindow?.year) return tiers.year ? [tiers.year] : [];
					return tiers.allTime ? [tiers.allTime] : [];
				}
			);
		}

		function allTimeMonth(values: HighlightValue[], species?: string) {
			return makeHighlightsOfType({ temporalUnit: 'month', species, values });
		}
		function yearScopedMonth(values: HighlightValue[], species?: string) {
			return makeHighlightsOfType({
				temporalUnit: 'month',
				parentTimeWindow: { year: 2024 },
				species,
				values
			});
		}

		it('remove lowest positioned of two similar highlights', async () => {
			// all-time is worse-positioned (2) than the year-scoped highlight (1) -
			// still enough to clobber it, since a clobberer only needs to be equal-or-worse
			mockAllTimeAndYear(
				allTimeMonth(secondPlaceValue(MONTH_PERIOD, 4)),
				yearScopedMonth(singleValue(MONTH_PERIOD, 7))
			);

			const result = await callForMonth();

			expect(survivesWithWindow(result, 'year')).toBe(false);
		});

		it('remove year-scoped hihglight when all time scoped exists', async () => {
			mockAllTimeAndYear(
				allTimeMonth(singleValue(MONTH_PERIOD, 5)),
				yearScopedMonth(singleValue(MONTH_PERIOD, 5))
			);

			const result = await callForMonth();

			expect(survivesWithWindow(result, 'year')).toBe(false);
		});

		it('remove month-scoped hihglight when all time scoped exists', async () => {
			mockTwoOfThreeTiers({
				allTime: makeHighlightsOfType({
					temporalUnit: 'day',
					values: singleValue(DAY_PERIOD, 5)
				}),
				month: makeHighlightsOfType({
					temporalUnit: 'day',
					parentTimeWindow: { month: 3 },
					values: singleValue(DAY_PERIOD, 5)
				})
			});

			const result = await callForDay();

			expect(survivesWithWindow(result, 'month')).toBe(false);
		});

		it('remove when both are tied', async () => {
			mockAllTimeAndYear(
				allTimeMonth(tiedValue(MONTH_PERIOD, 5)),
				yearScopedMonth(tiedValue(MONTH_PERIOD, 5))
			);

			const result = await callForMonth();

			expect(survivesWithWindow(result, 'year')).toBe(false);
		});

		it('remove when both are not tied', async () => {
			mockAllTimeAndYear(
				allTimeMonth(singleValue(MONTH_PERIOD, 5)),
				yearScopedMonth(singleValue(MONTH_PERIOD, 5))
			);

			const result = await callForMonth();

			expect(survivesWithWindow(result, 'year')).toBe(false);
		});

		it('remove when higher scoped is not tied and local scoped is tied', async () => {
			mockAllTimeAndYear(
				allTimeMonth(singleValue(MONTH_PERIOD, 5)),
				yearScopedMonth(tiedValue(MONTH_PERIOD, 5))
			);

			const result = await callForMonth();

			expect(survivesWithWindow(result, 'year')).toBe(false);
		});

		it("don't remove when higher scoped is tied and local scoped is not tied", async () => {
			mockAllTimeAndYear(
				allTimeMonth(tiedValue(MONTH_PERIOD, 5)),
				yearScopedMonth(singleValue(MONTH_PERIOD, 5))
			);

			const result = await callForMonth();

			expect(survivesWithWindow(result, 'year')).toBe(true);
		});

		it("don't remove year-scoped highlight when month-scoped exists", async () => {
			mockTwoOfThreeTiers({
				year: makeHighlightsOfType({
					temporalUnit: 'day',
					parentTimeWindow: { year: 2024 },
					values: singleValue(DAY_PERIOD, 5)
				}),
				month: makeHighlightsOfType({
					temporalUnit: 'day',
					parentTimeWindow: { month: 3 },
					values: singleValue(DAY_PERIOD, 9)
				})
			});

			const result = await callForDay();

			expect(survivesWithWindow(result, 'year')).toBe(true);
		});

		it("don't remove month-scoped hihglight when year-scoped exists", async () => {
			mockTwoOfThreeTiers({
				year: makeHighlightsOfType({
					temporalUnit: 'day',
					parentTimeWindow: { year: 2024 },
					values: singleValue(DAY_PERIOD, 9)
				}),
				month: makeHighlightsOfType({
					temporalUnit: 'day',
					parentTimeWindow: { month: 3 },
					values: singleValue(DAY_PERIOD, 5)
				})
			});

			const result = await callForDay();

			expect(survivesWithWindow(result, 'month')).toBe(true);
		});

		it("don't remove where type doesn't match", async () => {
			mockAllTimeAndYear(
				makeHighlightsOfType({
					type: 'type-a',
					temporalUnit: 'month',
					values: singleValue(MONTH_PERIOD, 5)
				}),
				makeHighlightsOfType({
					type: 'type-b',
					temporalUnit: 'month',
					parentTimeWindow: { year: 2024 },
					values: singleValue(MONTH_PERIOD, 5)
				})
			);

			const result = await callForMonth();

			expect(survivesWithWindow(result, 'year')).toBe(true);
		});

		it("don't remove wherer category doesn't match", async () => {
			mockAllTimeAndYear(
				makeHighlightsOfType({
					category: 'rarity',
					temporalUnit: 'month',
					values: singleValue(MONTH_PERIOD, 5)
				}),
				makeHighlightsOfType({
					category: 'count',
					temporalUnit: 'month',
					parentTimeWindow: { year: 2024 },
					values: singleValue(MONTH_PERIOD, 5)
				})
			);

			const result = await callForMonth();

			expect(survivesWithWindow(result, 'year')).toBe(true);
		});

		it("don't remove where species doesn't match", async () => {
			mockAllTimeAndYear(
				allTimeMonth(singleValue(MONTH_PERIOD, 5), 'robin'),
				yearScopedMonth(singleValue(MONTH_PERIOD, 5), 'wren')
			);

			const result = await callForMonth();

			expect(survivesWithWindow(result, 'year')).toBe(true);
		});
	});

	describe('combining highlights', () => {
		it('returns the correct shape for a combined highlight', async () => {
			const values = singleValue(YEAR_PERIOD, 5);
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({ values })
			]);

			const result = await callForYear();

			expect(result).toHaveLength(1);
			expect(Object.keys(result[0]).sort()).toEqual(
				[
					'bestPosition',
					'descriptor',
					'formatters',
					'scopes',
					'species',
					'value'
				].sort()
			);
			expect(result[0].descriptor).toEqual({
				category: 'count',
				type: 'test',
				unit: 'bird'
			});
			expect(result[0].value).toEqual(values[0]);
			expect(result[0].species).toBeUndefined();
			expect(result[0].bestPosition).toBe(1);
			expect(result[0].scopes).toHaveLength(1);
			expect(result[0].scopes[0].scope).toEqual({ temporalUnit: 'year' });
			expect(result[0].scopes[0].ranking.position).toBe(1);
			expect(result[0].scopes[0].ranking.isTied).toBe(false);
		});

		it('combines highlights with exact same descriptor (no species)', async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({ values: singleValue(YEAR_PERIOD, 5) }),
				makeHighlightsOfType({ values: singleValue(YEAR_PERIOD, 3) })
			]);

			const result = await callForYear();

			expect(result).toHaveLength(1);
			expect(result[0].scopes).toHaveLength(2);
		});

		it('combines highlights with exact same descriptor (with species)', async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({ values: singleValue(YEAR_PERIOD, 5, 'robin') }),
				makeHighlightsOfType({ values: singleValue(YEAR_PERIOD, 3, 'robin') })
			]);

			const result = await callForYear();

			expect(result).toHaveLength(1);
			expect(result[0].scopes).toHaveLength(2);
		});

		it("doesn't combine highlights with and without species", async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({ values: singleValue(YEAR_PERIOD, 5) }),
				makeHighlightsOfType({ values: singleValue(YEAR_PERIOD, 3, 'robin') })
			]);

			const result = await callForYear();

			expect(result).toHaveLength(2);
		});

		it("doesn't combine highlights of different type", async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({
					type: 'type-a',
					values: singleValue(YEAR_PERIOD, 5)
				}),
				makeHighlightsOfType({
					type: 'type-b',
					values: singleValue(YEAR_PERIOD, 3)
				})
			]);

			const result = await callForYear();

			expect(result).toHaveLength(2);
		});

		it("doesn't combine highlights of different category", async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({ values: singleValue(YEAR_PERIOD, 5) }),
				makeHighlightsOfType({
					category: 'rarity',
					values: singleValue(YEAR_PERIOD, 3)
				})
			]);

			const result = await callForYear();

			expect(result).toHaveLength(2);
		});

		it("doesn't combine highlights of different unit", async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({ values: singleValue(YEAR_PERIOD, 5) }),
				makeHighlightsOfType({
					unit: 'species',
					values: singleValue(YEAR_PERIOD, 3)
				})
			]);

			const result = await callForYear();

			expect(result).toHaveLength(2);
		});

		describe('sorting highlights', () => {
			it('when position is equal sorts all time scoped highlights ahead of month-scoped ahead of year-scoped highlights', async () => {
				// scope.species differs across entries so the all-time one never
				// clobbers the narrower-scoped ones in the significance filter, while
				// value.species stays equal so combineSimilarHighlights still groups them
				vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
					makeHighlightsOfType({ values: singleValue(YEAR_PERIOD, 10) }),
					makeHighlightsOfType({
						parentTimeWindow: { month: 3 },
						species: 'decoy-month',
						values: singleValue(YEAR_PERIOD, 7)
					}),
					makeHighlightsOfType({
						parentTimeWindow: { year: 2024 },
						species: 'decoy-year',
						values: singleValue(YEAR_PERIOD, 3)
					})
				]);

				const result = await callForYear();

				expect(result).toHaveLength(1);
				expect(result[0].value.value).toBe(10);
				expect(result[0].scopes[0].scope.parentTimeWindow).toBeUndefined();
				expect(result[0].scopes[1].scope.parentTimeWindow).toEqual({
					month: 3
				});
				expect(result[0].scopes[2].scope.parentTimeWindow).toEqual({
					year: 2024
				});
			});

			it('sorts highlights of better position (i.e.lower number) first (disregarding time period scoping)', async () => {
				vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
					makeHighlightsOfType({
						values: secondPlaceValue(YEAR_PERIOD, 4)
					}),
					makeHighlightsOfType({
						parentTimeWindow: { year: 2024 },
						species: 'decoy',
						values: singleValue(YEAR_PERIOD, 6)
					})
				]);

				const result = await callForYear();

				expect(result).toHaveLength(1);
				expect(result[0].value.value).toBe(6);
				expect(result[0].scopes[0].scope.parentTimeWindow).toEqual({
					year: 2024
				});
				expect(result[0].scopes[1].scope.parentTimeWindow).toBeUndefined();
			});
		});

		it('exposes the best position as bestPosition', async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({ values: singleValue(YEAR_PERIOD, 10) }),
				makeHighlightsOfType({ values: secondPlaceValue(YEAR_PERIOD, 5) })
			]);

			const result = await callForYear();

			expect(result).toHaveLength(1);
			expect(result[0].bestPosition).toBe(1);
			expect(result[0].value.value).toBe(10);
		});
	});

	describe('sorting combined highlights', () => {
		it('sorts by category first, regardless of other properties', async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({
					category: 'rarity',
					type: 'r',
					values: singleValue(YEAR_PERIOD, 1)
				}),
				makeHighlightsOfType({
					category: 'count',
					type: 'c',
					values: singleValue(YEAR_PERIOD, 1)
				}),
				makeHighlightsOfType({
					category: 'biometrics',
					type: 'b',
					values: singleValue(YEAR_PERIOD, 1)
				})
			]);

			const result = await callForYear();

			expect(result.map((r) => r.descriptor.category)).toEqual([
				'biometrics',
				'count',
				'rarity'
			]);
		});

		it('within a category, sorts items scoped to species below unscoped, regardless of other properties', async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({
					type: 'unscoped',
					values: secondPlaceValue(YEAR_PERIOD, 4)
				}),
				makeHighlightsOfType({
					type: 'scoped',
					species: 'robin',
					values: singleValue(YEAR_PERIOD, 7, 'robin')
				})
			]);

			const result = await callForYear();

			expect(result.map((r) => r.descriptor.type)).toEqual([
				'unscoped',
				'scoped'
			]);
		});

		it('within a category, sorts highlights of better position(i.e.lower number) first(disregarding time period scoping)', async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({
					type: 'a',
					values: secondPlaceValue(YEAR_PERIOD, 4)
				}),
				makeHighlightsOfType({
					type: 'b',
					parentTimeWindow: { year: 2024 },
					values: singleValue(YEAR_PERIOD, 3)
				})
			]);

			const result = await callForYear();

			expect(result.map((r) => r.descriptor.type)).toEqual(['b', 'a']);
		});

		it('within a category, when bestPosition is equal sorts by the scope of the first nested highlight', async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({
					type: 'x',
					parentTimeWindow: { month: 3 },
					values: singleValue(YEAR_PERIOD, 5)
				}),
				makeHighlightsOfType({
					type: 'y',
					values: singleValue(YEAR_PERIOD, 2)
				})
			]);

			const result = await callForYear();

			expect(result.map((r) => r.descriptor.type)).toEqual(['y', 'x']);
		});
	});
});
