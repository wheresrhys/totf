import type {
	HighlightScope,
	HighlightRanking,
	TemporalUnit,
	CombinedHighlight,
	HighlightsGenerator,
	EnhancedStatsRepository
} from '../../types';

// call each rule set's printers with standard data input shapes
// save as fixtures
// then write a test rule against outputs helper
// then the test suite is just running this for each onefor nopw just tests for day timePeriod
// TODO

// A rule scoped to one species at a time gets fixtures carrying a species (its
// printer reads combinedHighlight.species); a group-wide rule gets fixtures
// without one. Asking the rule's own statsSelector is what decides it: a
// per-species selector returns the coreStatsBySpecies record, every other selector
// returns a flat array — the same distinction generateAllHighlights makes when
// it builds a scope per species. Reading it off the selector rather than off a
// naming convention ('eachSpecies…') means a new per-species rule is covered
// without also having to be named like one.
export function isPerSpeciesRule(rule: HighlightsGenerator): boolean {
	const emptyStats: EnhancedStatsRepository = {
		coreStats: [],
		coreStatsWithSpecies: [],
		coreStatsBySpecies: {},
		biometricsStatsWithSpecies: [],
		biometricsStatsBySpecies: {}
	};
	return !Array.isArray(rule.statsSelector(emptyStats));
}

function getBaseScope(
	coreStatsWithSpecies: boolean,
	temporalUnit: TemporalUnit
): HighlightScope {
	return coreStatsWithSpecies
		? { temporalUnit, species: 'Robin' }
		: { temporalUnit };
}

function getCombinedHighlight(
	scopes: {
		scope: HighlightScope;
		ranking: Partial<HighlightRanking>;
	}[],
	coreStatsWithSpecies: boolean,
	year: number = 2020,
	// The count the highlight is about. Every fixture but 'singular global' uses
	// the same arbitrary 12, so a printer that has to agree with its value
	// grammatically (a plural species name, a plural unit) is exercised in both
	// directions by that one fixture.
	value: number = 12
): Partial<CombinedHighlight> {
	return {
		descriptor: { type: 'test-type', unit: 'bird', category: 'count' },
		value: {
			value,
			timePeriod: `${year}-02-02`,
			species: null
		},
		species: coreStatsWithSpecies ? 'Robin' : undefined,
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
	coreStatsWithSpecies: boolean
): Record<string, Partial<CombinedHighlight>> {
	return {
		global: getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day')
					},
					ranking: {
						position: 1,
						isTied: false
					}
				}
			],
			coreStatsWithSpecies
		),

		'tied global': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day')
					},
					ranking: {
						position: 1,
						isTied: true
					}
				}
			],
			coreStatsWithSpecies
		),
		// The same highlight as 'global', about a single bird rather than 12 —
		// the one fixture that exercises a printer's singular wording.
		'singular global': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day')
					},
					ranking: {
						position: 1,
						isTied: false
					}
				}
			],
			coreStatsWithSpecies,
			2020,
			1
		),
		'second global': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day')
					},
					ranking: {
						position: 2,
						isTied: false
					}
				}
			],
			coreStatsWithSpecies
		),
		'tied second global': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day')
					},
					ranking: {
						position: 2,
						isTied: true
					}
				}
			],
			coreStatsWithSpecies
		),
		'tied second of year': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day'),
						parentTimeWindow: { year: 2020 }
					},
					ranking: {
						position: 2,
						isTied: true
					}
				}
			],
			coreStatsWithSpecies
		),
		'this year': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day'),
						parentTimeWindow: { year: new Date().getFullYear() }
					},
					ranking: {
						position: 1
					}
				}
			],
			coreStatsWithSpecies,
			new Date().getFullYear()
		),

		'tied second of month': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day'),
						parentTimeWindow: { month: 2 }
					},
					ranking: {
						position: 2,
						isTied: true
					}
				}
			],
			coreStatsWithSpecies
		),
		'tied global and second of year': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day')
					},
					ranking: {
						position: 1,
						isTied: true
					}
				},
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day'),
						parentTimeWindow: { year: 2020 }
					},
					ranking: {
						position: 2,
						isTied: false
					}
				}
			],
			coreStatsWithSpecies
		),
		'global and tied second of year and third of month': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day')
					},
					ranking: {
						position: 1,
						isTied: false
					}
				},
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day'),
						parentTimeWindow: { year: 2020 }
					},
					ranking: {
						position: 2,
						isTied: true
					}
				},
				{
					scope: {
						...getBaseScope(coreStatsWithSpecies, 'day'),
						parentTimeWindow: { month: 2 }
					},
					ranking: {
						position: 3,
						isTied: false
					}
				}
			],
			coreStatsWithSpecies
		)
	};
}
