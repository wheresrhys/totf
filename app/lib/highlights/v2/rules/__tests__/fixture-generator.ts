import type {
	HighlightScope,
	HighlightRanking,
	TemporalUnit,
	CombinedHighlight
} from '../../types';
// call each rule set's printers with standard data input shapes
// save as fixtures
// then write a test rule against outputs helper
// then the test suite is just running this for each onefor nopw just tests for day timePeriod
// TODO

function getBaseScope(
	withSpecies: boolean,
	temporalUnit: TemporalUnit
): HighlightScope {
	return withSpecies ? { temporalUnit, species: 'Robin' } : { temporalUnit };
}

function getCombinedHighlight(
	scopes: {
		scope: HighlightScope;
		ranking: Partial<HighlightRanking>;
	}[],
	withSpecies: boolean,
	year: number = 2020
): Partial<CombinedHighlight> {
	return {
		descriptor: { type: 'test-type', unit: 'bird', category: 'count' },
		value: {
			value: 12,
			timePeriod: `${year}-02-02`,
			species: null
		},
		species: withSpecies ? 'Robin' : undefined,
		bestPosition: Math.max(
			...scopes.map((scope) => scope.ranking.position as number)
		),
		scopes: scopes as {
			scope: HighlightScope;
			ranking: HighlightRanking;
		}[]
	};
}

export function getCombinedHighlightFixtures(
	withSpecies: boolean
): Record<string, Partial<CombinedHighlight>> {
	return {
		global: getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(withSpecies, 'day')
					},
					ranking: {
						position: 1,
						isTied: false
					}
				}
			],
			withSpecies
		),

		'tied global': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(withSpecies, 'day')
					},
					ranking: {
						position: 1,
						isTied: true
					}
				}
			],
			withSpecies
		),
		'second global': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(withSpecies, 'day')
					},
					ranking: {
						position: 2,
						isTied: false
					}
				}
			],
			withSpecies
		),
		'tied second global': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(withSpecies, 'day')
					},
					ranking: {
						position: 2,
						isTied: true
					}
				}
			],
			withSpecies
		),
		'tied second of year': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(withSpecies, 'day'),
						parentTimeWindow: { year: 2020 }
					},
					ranking: {
						position: 2,
						isTied: true
					}
				}
			],
			withSpecies
		),
		'this year': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(withSpecies, 'day'),
						parentTimeWindow: { year: new Date().getFullYear() }
					},
					ranking: {
						position: 1
					}
				}
			],
			withSpecies,
			new Date().getFullYear()
		),

		'tied second of month': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(withSpecies, 'day'),
						parentTimeWindow: { month: 2 }
					},
					ranking: {
						position: 2,
						isTied: true
					}
				}
			],
			withSpecies
		),
		'tied global and second of year': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(withSpecies, 'day')
					},
					ranking: {
						position: 1,
						isTied: true
					}
				},
				{
					scope: {
						...getBaseScope(withSpecies, 'day'),
						parentTimeWindow: { year: 2020 }
					},
					ranking: {
						position: 2,
						isTied: false
					}
				}
			],
			withSpecies
		),
		'global and tied second of year and third of month': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(withSpecies, 'day')
					},
					ranking: {
						position: 1,
						isTied: false
					}
				},
				{
					scope: {
						...getBaseScope(withSpecies, 'day'),
						parentTimeWindow: { year: 2020 }
					},
					ranking: {
						position: 2,
						isTied: true
					}
				},
				{
					scope: {
						...getBaseScope(withSpecies, 'day'),
						parentTimeWindow: { month: 2 }
					},
					ranking: {
						position: 3,
						isTied: false
					}
				}
			],
			withSpecies
		)
	};
}
