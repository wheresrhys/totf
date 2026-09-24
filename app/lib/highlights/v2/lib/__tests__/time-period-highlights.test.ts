import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HighlightsOfType, HighlightValue } from '../../types';
// mock getHighlightsWithinTimeWindow
vi.mock('../highlight-generator', () => ({
	getHighlightsWithinTimeWindow: vi.fn()
}));
import { getHighlightsWithinTimeWindow } from '../highlight-generator';
import { getCondensedHighlightsAtTimePeriod } from '../time-period-highlights';

function makeValue(
	timePeriod: string,
	value: number,
	species: string | null = null
): HighlightValue {
	return { timePeriod, value, species };
}

function makeHighlightsOfType(
	overrides: Partial<HighlightsOfType> = {}
): HighlightsOfType {
	return {
		formatters: {
			highlightListPrefixPrinter: vi.fn(),
			combinedHighlightPrinter: vi.fn()
		},
		descriptor: { category: 'count', type: 'test', unit: 'bird' },
		scope: { temporalUnit: 'day' },
		values: [],
		...overrides
	} as HighlightsOfType;
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
									descriptor: {
										category: 'count',
										type: 'month-rule',
										unit: 'bird'
									},
									scope: { temporalUnit: 'day', parentTimeWindow },
									values: [makeValue('2024-03-15', 1)]
								})
							];
						}
						if (parentTimeWindow?.year) {
							return [
								makeHighlightsOfType({
									descriptor: {
										category: 'count',
										type: 'year-rule',
										unit: 'bird'
									},
									scope: { temporalUnit: 'day', parentTimeWindow },
									values: [makeValue('2024-03-15', 1)]
								})
							];
						}
						return [
							makeHighlightsOfType({
								descriptor: {
									category: 'count',
									type: 'all-time-rule',
									unit: 'bird'
								},
								scope: { temporalUnit: 'day' },
								values: [makeValue('2024-03-15', 1)]
							})
						];
					}
				);

				const result = await getCondensedHighlightsAtTimePeriod(
					1,
					'2024-03-15',
					'day'
				);

				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledTimes(3);
				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledWith({
					temporalUnit: 'day',
					groupId: 1,
					limit: 3,
					includePerSpecies: true
				});
				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledWith({
					temporalUnit: 'day',
					groupId: 1,
					parentTimeWindow: { year: 2024 },
					limit: 1,
					includePerSpecies: true
				});
				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledWith({
					temporalUnit: 'day',
					groupId: 1,
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
								descriptor: {
									category: 'count',
									type: 'matches',
									unit: 'bird'
								},
								values: [makeValue('2024-03-14', 5), makeValue('2024-03-15', 9)]
							}),
							makeHighlightsOfType({
								descriptor: {
									category: 'count',
									type: 'no-match',
									unit: 'bird'
								},
								values: [makeValue('2024-03-01', 2), makeValue('2024-04-01', 4)]
							})
						];
					}
				);

				const result = await getCondensedHighlightsAtTimePeriod(
					1,
					'2024-03-15',
					'day'
				);

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
									descriptor: {
										category: 'count',
										type: 'year-rule',
										unit: 'bird'
									},
									scope: { temporalUnit: 'month', parentTimeWindow },
									values: [makeValue('2024-03', 1)]
								})
							];
						}
						return [
							makeHighlightsOfType({
								descriptor: {
									category: 'count',
									type: 'all-time-rule',
									unit: 'bird'
								},
								scope: { temporalUnit: 'month' },
								values: [makeValue('2024-03', 1)]
							})
						];
					}
				);

				const result = await getCondensedHighlightsAtTimePeriod(
					1,
					'2024-03',
					'month'
				);

				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledTimes(2);
				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledWith({
					temporalUnit: 'month',
					groupId: 1,
					limit: 3,
					includePerSpecies: true
				});
				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledWith({
					temporalUnit: 'month',
					groupId: 1,
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
								descriptor: {
									category: 'count',
									type: 'matches',
									unit: 'bird'
								},
								values: [makeValue('2024-02', 5), makeValue('2024-03', 9)]
							}),
							makeHighlightsOfType({
								descriptor: {
									category: 'count',
									type: 'no-match',
									unit: 'bird'
								},
								values: [makeValue('2024-01', 2), makeValue('2024-04', 4)]
							})
						];
					}
				);

				const result = await getCondensedHighlightsAtTimePeriod(
					1,
					'2024-03',
					'month'
				);

				expect(result.map((r) => r.descriptor.type)).toEqual(['matches']);
				expect(result[0].value.value).toBe(9);
			});
		});

		describe('year', () => {
			it('fetches all time highlights when calculating for a year', async () => {
				vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
					makeHighlightsOfType({
						scope: { temporalUnit: 'year' },
						values: [makeValue('2024', 7)]
					})
				]);

				const result = await getCondensedHighlightsAtTimePeriod(
					1,
					'2024',
					'year'
				);

				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledTimes(1);
				expect(getHighlightsWithinTimeWindow).toHaveBeenCalledWith({
					temporalUnit: 'year',
					groupId: 1,
					limit: 3,
					includePerSpecies: true
				});
				expect(result[0].value.value).toBe(7);
			});

			it('filters out highlights that do not occur in the relevant year', async () => {
				vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
					makeHighlightsOfType({
						descriptor: { category: 'count', type: 'matches', unit: 'bird' },
						values: [makeValue('2023', 5), makeValue('2024', 9)]
					}),
					makeHighlightsOfType({
						descriptor: { category: 'count', type: 'no-match', unit: 'bird' },
						values: [makeValue('2022', 2), makeValue('2021', 4)]
					})
				]);

				const result = await getCondensedHighlightsAtTimePeriod(
					1,
					'2024',
					'year'
				);

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
			return makeHighlightsOfType({
				scope: { temporalUnit: 'month', species },
				values
			});
		}
		function yearScopedMonth(values: HighlightValue[], species?: string) {
			return makeHighlightsOfType({
				scope: {
					temporalUnit: 'month',
					parentTimeWindow: { year: 2024 },
					species
				},
				values
			});
		}

		it('remove lowest positioned of two similar highlights', async () => {
			// all-time is worse-positioned (2) than the year-scoped highlight (1) -
			// still enough to clobber it, since a clobberer only needs to be equal-or-worse
			mockAllTimeAndYear(
				allTimeMonth([makeValue('other', 9), makeValue('2024-03', 4)]),
				yearScopedMonth([makeValue('2024-03', 7)])
			);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024-03',
				'month'
			);

			expect(survivesWithWindow(result, 'year')).toBe(false);
		});

		it('remove year-scoped hihglight when all time scoped exists', async () => {
			mockAllTimeAndYear(
				allTimeMonth([makeValue('2024-03', 5)]),
				yearScopedMonth([makeValue('2024-03', 5)])
			);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024-03',
				'month'
			);

			expect(survivesWithWindow(result, 'year')).toBe(false);
		});

		it('remove month-scoped hihglight when all time scoped exists', async () => {
			mockTwoOfThreeTiers({
				allTime: makeHighlightsOfType({
					scope: { temporalUnit: 'day' },
					values: [makeValue('2024-03-15', 5)]
				}),
				month: makeHighlightsOfType({
					scope: { temporalUnit: 'day', parentTimeWindow: { month: 3 } },
					values: [makeValue('2024-03-15', 5)]
				})
			});

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024-03-15',
				'day'
			);

			expect(survivesWithWindow(result, 'month')).toBe(false);
		});

		it('remove when both are tied', async () => {
			mockAllTimeAndYear(
				allTimeMonth([makeValue('2024-03', 5), makeValue('decoy-a', 5)]),
				yearScopedMonth([makeValue('2024-03', 5), makeValue('decoy-b', 5)])
			);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024-03',
				'month'
			);

			expect(survivesWithWindow(result, 'year')).toBe(false);
		});

		it('remove when both are not tied', async () => {
			mockAllTimeAndYear(
				allTimeMonth([makeValue('2024-03', 5)]),
				yearScopedMonth([makeValue('2024-03', 5)])
			);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024-03',
				'month'
			);

			expect(survivesWithWindow(result, 'year')).toBe(false);
		});

		it('remove when higher scoped is not tied and local scoped is tied', async () => {
			mockAllTimeAndYear(
				allTimeMonth([makeValue('2024-03', 5)]),
				yearScopedMonth([makeValue('2024-03', 5), makeValue('decoy', 5)])
			);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024-03',
				'month'
			);

			expect(survivesWithWindow(result, 'year')).toBe(false);
		});

		it("don't remove when higher scoped is tied and local scoped is not tied", async () => {
			mockAllTimeAndYear(
				allTimeMonth([makeValue('2024-03', 5), makeValue('decoy', 5)]),
				yearScopedMonth([makeValue('2024-03', 5)])
			);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024-03',
				'month'
			);

			expect(survivesWithWindow(result, 'year')).toBe(true);
		});

		it("don't remove year-scoped highlight when month-scoped exists", async () => {
			mockTwoOfThreeTiers({
				year: makeHighlightsOfType({
					scope: { temporalUnit: 'day', parentTimeWindow: { year: 2024 } },
					values: [makeValue('2024-03-15', 5)]
				}),
				month: makeHighlightsOfType({
					scope: { temporalUnit: 'day', parentTimeWindow: { month: 3 } },
					values: [makeValue('2024-03-15', 9)]
				})
			});

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024-03-15',
				'day'
			);

			expect(survivesWithWindow(result, 'year')).toBe(true);
		});

		it("don't remove month-scoped hihglight when year-scoped exists", async () => {
			mockTwoOfThreeTiers({
				year: makeHighlightsOfType({
					scope: { temporalUnit: 'day', parentTimeWindow: { year: 2024 } },
					values: [makeValue('2024-03-15', 9)]
				}),
				month: makeHighlightsOfType({
					scope: { temporalUnit: 'day', parentTimeWindow: { month: 3 } },
					values: [makeValue('2024-03-15', 5)]
				})
			});

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024-03-15',
				'day'
			);

			expect(survivesWithWindow(result, 'month')).toBe(true);
		});

		it("don't remove where type doesn't match", async () => {
			mockAllTimeAndYear(
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'type-a', unit: 'bird' },
					scope: { temporalUnit: 'month' },
					values: [makeValue('2024-03', 5)]
				}),
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'type-b', unit: 'bird' },
					scope: { temporalUnit: 'month', parentTimeWindow: { year: 2024 } },
					values: [makeValue('2024-03', 5)]
				})
			);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024-03',
				'month'
			);

			expect(survivesWithWindow(result, 'year')).toBe(true);
		});

		it("don't remove wherer category doesn't match", async () => {
			mockAllTimeAndYear(
				makeHighlightsOfType({
					descriptor: { category: 'rarity', type: 'test', unit: 'bird' },
					scope: { temporalUnit: 'month' },
					values: [makeValue('2024-03', 5)]
				}),
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'test', unit: 'bird' },
					scope: { temporalUnit: 'month', parentTimeWindow: { year: 2024 } },
					values: [makeValue('2024-03', 5)]
				})
			);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024-03',
				'month'
			);

			expect(survivesWithWindow(result, 'year')).toBe(true);
		});

		it("don't remove where species doesn't match", async () => {
			mockAllTimeAndYear(
				allTimeMonth([makeValue('2024-03', 5)], 'robin'),
				yearScopedMonth([makeValue('2024-03', 5)], 'wren')
			);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024-03',
				'month'
			);

			expect(survivesWithWindow(result, 'year')).toBe(true);
		});
	});

	describe('combining highlights', () => {
		it('returns the correct shape for a combined highlight', async () => {
			const values = [makeValue('2024', 5)];
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({ scope: { temporalUnit: 'year' }, values })
			]);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024',
				'year'
			);

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
				makeHighlightsOfType({ values: [makeValue('2024', 5)] }),
				makeHighlightsOfType({ values: [makeValue('2024', 3)] })
			]);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024',
				'year'
			);

			expect(result).toHaveLength(1);
			expect(result[0].scopes).toHaveLength(2);
		});

		it('combines highlights with exact same descriptor (with species)', async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({ values: [makeValue('2024', 5, 'robin')] }),
				makeHighlightsOfType({ values: [makeValue('2024', 3, 'robin')] })
			]);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024',
				'year'
			);

			expect(result).toHaveLength(1);
			expect(result[0].scopes).toHaveLength(2);
		});

		it("doesn't combine highlights with and without species", async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({ values: [makeValue('2024', 5, null)] }),
				makeHighlightsOfType({ values: [makeValue('2024', 3, 'robin')] })
			]);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024',
				'year'
			);

			expect(result).toHaveLength(2);
		});

		it("doesn't combine highlights of different type", async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'type-a', unit: 'bird' },
					values: [makeValue('2024', 5)]
				}),
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'type-b', unit: 'bird' },
					values: [makeValue('2024', 3)]
				})
			]);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024',
				'year'
			);

			expect(result).toHaveLength(2);
		});

		it("doesn't combine highlights of different category", async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'test', unit: 'bird' },
					values: [makeValue('2024', 5)]
				}),
				makeHighlightsOfType({
					descriptor: { category: 'rarity', type: 'test', unit: 'bird' },
					values: [makeValue('2024', 3)]
				})
			]);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024',
				'year'
			);

			expect(result).toHaveLength(2);
		});

		it("doesn't combine highlights of different unit", async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'test', unit: 'bird' },
					values: [makeValue('2024', 5)]
				}),
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'test', unit: 'species' },
					values: [makeValue('2024', 3)]
				})
			]);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024',
				'year'
			);

			expect(result).toHaveLength(2);
		});

		describe('sorting highlights', () => {
			it('when position is equal sorts all time scoped highlights ahead of month-scoped ahead of year-scoped highlights', async () => {
				// scope.species differs across entries so the all-time one never
				// clobbers the narrower-scoped ones in the significance filter, while
				// value.species stays equal so combineSimilarHighlights still groups them
				vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
					makeHighlightsOfType({
						scope: { temporalUnit: 'year' },
						values: [makeValue('2024', 10)]
					}),
					makeHighlightsOfType({
						scope: {
							temporalUnit: 'year',
							parentTimeWindow: { month: 3 },
							species: 'decoy-month'
						},
						values: [makeValue('2024', 7)]
					}),
					makeHighlightsOfType({
						scope: {
							temporalUnit: 'year',
							parentTimeWindow: { year: 2024 },
							species: 'decoy-year'
						},
						values: [makeValue('2024', 3)]
					})
				]);

				const result = await getCondensedHighlightsAtTimePeriod(
					1,
					'2024',
					'year'
				);

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
						scope: { temporalUnit: 'year' },
						values: [makeValue('other', 9), makeValue('2024', 4)]
					}),
					makeHighlightsOfType({
						scope: {
							temporalUnit: 'year',
							parentTimeWindow: { year: 2024 },
							species: 'decoy'
						},
						values: [makeValue('2024', 6)]
					})
				]);

				const result = await getCondensedHighlightsAtTimePeriod(
					1,
					'2024',
					'year'
				);

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
				makeHighlightsOfType({ values: [makeValue('2024', 10)] }),
				makeHighlightsOfType({
					values: [makeValue('other', 50), makeValue('2024', 5)]
				})
			]);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024',
				'year'
			);

			expect(result).toHaveLength(1);
			expect(result[0].bestPosition).toBe(1);
			expect(result[0].value.value).toBe(10);
		});
	});

	describe('sorting combined highlights', () => {
		it('sorts by category first, regardless of other properties', async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({
					descriptor: { category: 'rarity', type: 'r', unit: 'bird' },
					values: [makeValue('2024', 1)]
				}),
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'c', unit: 'bird' },
					values: [makeValue('2024', 1)]
				}),
				makeHighlightsOfType({
					descriptor: { category: 'biometrics', type: 'b', unit: 'bird' },
					values: [makeValue('2024', 1)]
				})
			]);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024',
				'year'
			);

			expect(result.map((r) => r.descriptor.category)).toEqual([
				'biometrics',
				'count',
				'rarity'
			]);
		});

		it('within a category, sorts items scoped to species below unscoped, regardless of other properties', async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'unscoped', unit: 'bird' },
					scope: { temporalUnit: 'year' },
					values: [makeValue('other', 9), makeValue('2024', 4)]
				}),
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'scoped', unit: 'bird' },
					scope: { temporalUnit: 'year', species: 'robin' },
					values: [makeValue('2024', 7, 'robin')]
				})
			]);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024',
				'year'
			);

			expect(result.map((r) => r.descriptor.type)).toEqual([
				'unscoped',
				'scoped'
			]);
		});

		it('within a category, sorts highlights of better position(i.e.lower number) first(disregarding time period scoping)', async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'a', unit: 'bird' },
					scope: { temporalUnit: 'year' },
					values: [makeValue('other', 9), makeValue('2024', 4)]
				}),
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'b', unit: 'bird' },
					scope: { temporalUnit: 'year', parentTimeWindow: { year: 2024 } },
					values: [makeValue('2024', 3)]
				})
			]);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024',
				'year'
			);

			expect(result.map((r) => r.descriptor.type)).toEqual(['b', 'a']);
		});

		it('within a category, when bestPosition is equal sorts by the scope of the first nested highlight', async () => {
			vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'x', unit: 'bird' },
					scope: { temporalUnit: 'year', parentTimeWindow: { month: 3 } },
					values: [makeValue('2024', 5)]
				}),
				makeHighlightsOfType({
					descriptor: { category: 'count', type: 'y', unit: 'bird' },
					scope: { temporalUnit: 'year' },
					values: [makeValue('2024', 2)]
				})
			]);

			const result = await getCondensedHighlightsAtTimePeriod(
				1,
				'2024',
				'year'
			);

			expect(result.map((r) => r.descriptor.type)).toEqual(['y', 'x']);
		});
	});
});
