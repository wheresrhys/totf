import type {
	HighlightScope,
	HighlightRanking,
	TemporalUnit,
	CombinedHighlight,
	HighlightsGenerator,
	EnhancedStatsRepository,
	HighlightDescriptor
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
	return !Array.isArray(emptyStats[rule.statsSelector]);
}

function getBaseScope(
	bySpecies: boolean,
	temporalUnit: TemporalUnit
): HighlightScope {
	return bySpecies ? { temporalUnit, species: 'Robin' } : { temporalUnit };
}

function getCombinedHighlightMaker(descriptor: HighlightDescriptor) {
	return (
		scopes: {
			scope: HighlightScope;
			ranking: Partial<HighlightRanking>;
		}[],
		bySpecies: boolean,
		year: number = 2020,
		// The count the highlight is about. Every fixture but 'singular global' uses
		// the same arbitrary 12, so a printer that has to agree with its value
		// grammatically (a plural species name, a plural unit) is exercised in both
		// directions by that one fixture.
		value: number = 12
	): Partial<CombinedHighlight> => {
		return {
			descriptor,
			value: {
				value,
				timePeriod: `${year}-02-02`,
				species: null
			},
			species: bySpecies ? 'Robin' : undefined,
			bestPosition: Math.max(
				...scopes.map((scope) => scope.ranking.position as number)
			),
			scopes: scopes as {
				scope: HighlightScope;
				ranking: HighlightRanking;
			}[]
		};
	};
}

export function getCombinedHighlightFixtures(
	rule: HighlightsGenerator
): Record<string, Partial<CombinedHighlight>> {
	const bySpecies = isPerSpeciesRule(rule);
	const temporalUnit =
		!rule.condition || rule.condition({ temporalUnit: 'day' })
			? 'day'
			: 'month';
	const getCombinedHighlight = getCombinedHighlightMaker(rule.descriptor);
	const fixtures: Record<string, Partial<CombinedHighlight>> = {
		global: getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(bySpecies, 'day')
					},
					ranking: {
						position: 1,
						isTied: false
					}
				}
			],
			bySpecies
		),

		'tied global': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(bySpecies, temporalUnit)
					},
					ranking: {
						position: 1,
						isTied: true
					}
				}
			],
			bySpecies
		),
		// The same highlight as 'global', about a single bird rather than 12 —
		// the one fixture that exercises a printer's singular wording.
		'singular global': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(bySpecies, temporalUnit)
					},
					ranking: {
						position: 1,
						isTied: false
					}
				}
			],
			bySpecies,
			2020,
			1
		),
		'second global': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(bySpecies, temporalUnit)
					},
					ranking: {
						position: 2,
						isTied: false
					}
				}
			],
			bySpecies
		),
		'tied second global': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(bySpecies, temporalUnit)
					},
					ranking: {
						position: 2,
						isTied: true
					}
				}
			],
			bySpecies
		),
		'tied second of year': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(bySpecies, temporalUnit),
						parentTimeWindow: { year: 2020 }
					},
					ranking: {
						position: 2,
						isTied: true
					}
				}
			],
			bySpecies
		),
		'this year': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(bySpecies, temporalUnit),
						parentTimeWindow: { year: new Date().getFullYear() }
					},
					ranking: {
						position: 1
					}
				}
			],
			bySpecies,
			new Date().getFullYear()
		),

		'tied global and second of year': getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(bySpecies, temporalUnit)
					},
					ranking: {
						position: 1,
						isTied: true
					}
				},
				{
					scope: {
						...getBaseScope(bySpecies, temporalUnit),
						parentTimeWindow: { year: 2020 }
					},
					ranking: {
						position: 2,
						isTied: false
					}
				}
			],
			bySpecies
		)
	};

	if (temporalUnit === 'day') {
		fixtures['tied second of month'] = getCombinedHighlight(
			[
				{
					scope: {
						...getBaseScope(bySpecies, temporalUnit),
						parentTimeWindow: { month: 2 }
					},
					ranking: {
						position: 2,
						isTied: true
					}
				}
			],
			bySpecies
		);
		fixtures['global and tied second of year and third of month'] =
			getCombinedHighlight(
				[
					{
						scope: {
							...getBaseScope(bySpecies, temporalUnit)
						},
						ranking: {
							position: 1,
							isTied: false
						}
					},
					{
						scope: {
							...getBaseScope(bySpecies, temporalUnit),
							parentTimeWindow: { year: 2020 }
						},
						ranking: {
							position: 2,
							isTied: true
						}
					},
					{
						scope: {
							...getBaseScope(bySpecies, temporalUnit),
							parentTimeWindow: { month: 2 }
						},
						ranking: {
							position: 3,
							isTied: false
						}
					}
				],
				bySpecies
			);
	}
	return fixtures;
}
