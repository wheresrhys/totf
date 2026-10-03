import type {
	HighlightScope,
	HighlightRanking,
	TemporalUnit,
	CombinedHighlight,
	HighlightsGenerator,
	EnhancedStatsRepository,
	HighlightDescriptor,
	HighlightsOfType
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
				species: bySpecies ? 'Robin' : null
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

export function getHighlightsOfTypeFixtures(
	rule: HighlightsGenerator
): Record<string, HighlightsOfType> {
	return {
		'single session': {
			descriptor: rule.descriptor,
			scope: {
				temporalUnit: 'day'
			},
			values: [
				{
					value: 12,
					timePeriod: `2020-02-02`,
					species: 'Robin'
				}
			],
			formatters: rule.formatters
		},
		'multiple month': {
			descriptor: rule.descriptor,
			scope: {
				temporalUnit: 'month'
			},
			values: [
				{
					value: 12,
					timePeriod: `2020-02-02`,
					species: 'Robin'
				},
				{
					value: 1,
					timePeriod: `2020-02-02`,
					species: 'Blackcap'
				}
			],
			formatters: rule.formatters
		}
	};
}

export function getCombinedHighlightFixtures(
	rule: HighlightsGenerator
): Record<string, Partial<CombinedHighlight>> {
	const supportsMonth = rule.condition?.({ temporalUnit: 'month' }) ?? true;
	const supportsDay = rule.condition?.({ temporalUnit: 'day' }) ?? true;

	return {
		...(supportsDay
			? getCombinedHighlightFixturesForTemporalUnit(rule, 'day')
			: {}),
		...(supportsMonth
			? getCombinedHighlightFixturesForTemporalUnit(rule, 'month')
			: {})
	};
}

function getRankedScope(
	bySpecies: boolean,
	temporalUnit: TemporalUnit,
	position: number,
	isTied: boolean,
	parentTimeWindow?: { year?: number; month?: number }
): { scope: HighlightScope; ranking: Partial<HighlightRanking> } {
	return {
		scope: {
			...getBaseScope(bySpecies, temporalUnit),
			parentTimeWindow
		},
		ranking: {
			position: 1,
			isTied: false
		}
	};
}

export function getCombinedHighlightFixturesForTemporalUnit(
	rule: HighlightsGenerator,
	temporalUnit: TemporalUnit
): Record<string, Partial<CombinedHighlight>> {
	const bySpecies = isPerSpeciesRule(rule);

	const getCombinedHighlight = getCombinedHighlightMaker(rule.descriptor);
	const fixtures: Record<string, Partial<CombinedHighlight>> = {
		global: getCombinedHighlight(
			[getRankedScope(bySpecies, temporalUnit, 1, false)],
			bySpecies
		),

		'tied global': getCombinedHighlight(
			[getRankedScope(bySpecies, temporalUnit, 1, true)],
			bySpecies
		),
		// The same highlight as 'global', about a single bird rather than 12 —
		// the one fixture that exercises a printer's singular wording.
		'singular global': getCombinedHighlight(
			[getRankedScope(bySpecies, temporalUnit, 1, false)],
			bySpecies,
			2020,
			1
		),
		'second global': getCombinedHighlight(
			[getRankedScope(bySpecies, temporalUnit, 2, false)],
			bySpecies
		),
		'tied second global': getCombinedHighlight(
			[getRankedScope(bySpecies, temporalUnit, 2, true)],
			bySpecies
		),
		'tied second of year': getCombinedHighlight(
			[getRankedScope(bySpecies, temporalUnit, 2, true, { year: 2020 })],
			bySpecies
		),
		'this year': getCombinedHighlight(
			[
				getRankedScope(bySpecies, temporalUnit, 1, false, {
					year: new Date().getFullYear()
				})
			],
			bySpecies,
			new Date().getFullYear()
		),

		'tied global and second of year': getCombinedHighlight(
			[
				getRankedScope(bySpecies, temporalUnit, 1, true),
				getRankedScope(bySpecies, temporalUnit, 2, false, { year: 2020 })
			],
			bySpecies
		)
	};

	if (temporalUnit === 'day') {
		fixtures['tied second of month'] = getCombinedHighlight(
			[getRankedScope(bySpecies, temporalUnit, 2, true, { month: 2 })],
			bySpecies
		);
		fixtures['global and tied second of year and third of month'] =
			getCombinedHighlight(
				[
					getRankedScope(bySpecies, temporalUnit, 2, false),
					getRankedScope(bySpecies, temporalUnit, 2, true, { year: 2020 }),
					getRankedScope(bySpecies, temporalUnit, 3, false, { month: 2 })
				],
				bySpecies
			);
	}
	return Object.fromEntries(
		Object.entries(fixtures).map(([name, fixture]) => [
			`${name} (${temporalUnit})`,
			fixture
		])
	);
}
