import type {
	HighlightScope,
	HighlightRanking,
	TemporalUnit,
	CombinedHighlight,
	HighlightsGenerator
} from '../../types';
import type { CoreStatsResult } from '@/app/models/db';
import type { StatsRepository } from '@/app/actions/stats-cache';

// call each rule set's printers with standard data input shapes
// save as fixtures
// then write a test rule against outputs helper
// then the test suite is just running this for each onefor nopw just tests for day timePeriod
// TODO

// A rule scoped to one species at a time gets fixtures carrying a species (its
// printer reads combinedHighlight.species); a group-wide rule gets fixtures
// without one. Asking the rule's own statsSelector is what decides it: a
// per-species selector returns the bySpecies record, every other selector
// returns a flat array — the same distinction generateAllHighlights makes when
// it builds a scope per species. Reading it off the selector rather than off a
// naming convention ('eachSpecies…') means a new per-species rule is covered
// without also having to be named like one.
export function isPerSpeciesRule(rule: HighlightsGenerator): boolean {
	const emptyStats: StatsRepository<CoreStatsResult> = {
		overall: [],
		withSpecies: [],
		bySpecies: {}
	};
	return !Array.isArray(rule.statsSelector(emptyStats));
}

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
		// The same highlight as 'global', about a single bird rather than 12 —
		// the one fixture that exercises a printer's singular wording.
		'singular global': getCombinedHighlight(
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
			withSpecies,
			2020,
			1
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
