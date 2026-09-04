import { describe, it, expect } from 'vitest';
import { renderCountHighlight } from '../renderers';
import type {
	CountHighlight,
	SessionTotalJuvRecordHighlight,
	SessionTotalRecordHighlight,
	SinceComparisonHighlight,
	SpeciesCountRecordHighlight,
	SpeciesJuvCountRecordHighlight
} from '@/app/models/highlights';

// Moved from the old flat app/components/session-highlight-renderers.tsx
// coverage as part of #760's componentized-per-group renderers split.

// Overrides for the per-family highlight factories — every field bar the
// fixed `type` discriminant
type HighlightFields<T extends CountHighlight> = Omit<T, 'type'>;

// Each highlight renders <li key={sentence}>{sentence}</li>; the copy tests
// assert on the sentence text
function renderedText(highlight: CountHighlight): string {
	return (renderCountHighlight(highlight).props as { children: string })
		.children;
}

function makeHighlight(
	overrides: Partial<HighlightFields<SessionTotalRecordHighlight>>
): SessionTotalRecordHighlight {
	return {
		type: 'session-total-record',
		metric: 'encounters',
		scope: 'all-time',
		value: 74,
		year: 2024,
		isCurrentYear: false,
		...overrides
	};
}

describe('render — element shape', () => {
	it('renders a list item keyed by the sentence', () => {
		const element = renderCountHighlight(makeHighlight({}));
		expect(element.type).toBe('li');
		expect(element.key).toBe('Busiest session ever — 74 birds');
	});
});

describe('render — session-total-record', () => {
	it('renders all-time busiest copy', () => {
		expect(renderedText(makeHighlight({}))).toBe(
			'Busiest session ever — 74 birds'
		);
	});

	it('renders this-year busiest copy as "this year" for a current-year session', () => {
		expect(
			renderedText(makeHighlight({ scope: 'this-year', isCurrentYear: true }))
		).toBe('Busiest session this year — 74 birds');
	});

	it('renders this-year busiest copy with the year for a past session', () => {
		expect(renderedText(makeHighlight({ scope: 'this-year' }))).toBe(
			'Busiest session of 2024 — 74 birds'
		);
	});

	it('renders most-varied copy for the species metric', () => {
		expect(renderedText(makeHighlight({ metric: 'species', value: 18 }))).toBe(
			'Most varied session ever — 18 species'
		);
	});

	it('renders busiest-for-N-years copy for an all-time tie', () => {
		expect(renderedText(makeHighlight({ recordEqualledYearsAgo: 3 }))).toBe(
			'Busiest session for 3 years — 74 birds'
		);
	});
});

function makeSpeciesHighlight(
	overrides: Partial<HighlightFields<SpeciesCountRecordHighlight>>
): SpeciesCountRecordHighlight {
	return {
		type: 'species-count-record',
		speciesName: 'Reed Warbler',
		scope: 'all-time',
		value: 12,
		year: 2024,
		isCurrentYear: false,
		...overrides
	};
}

describe('render — species-count-record', () => {
	it('renders all-time copy', () => {
		expect(renderedText(makeSpeciesHighlight({}))).toBe(
			'Record day for Reed Warbler — 12 caught, the most ever'
		);
	});

	it('renders current-year this-year copy ("this year")', () => {
		expect(
			renderedText(
				makeSpeciesHighlight({ scope: 'this-year', isCurrentYear: true })
			)
		).toBe('Record day for Reed Warbler — 12 caught, the most this year');
	});

	it('renders past-year this-year copy ("of 2024")', () => {
		expect(renderedText(makeSpeciesHighlight({ scope: 'this-year' }))).toBe(
			'Record day for Reed Warbler — 12 caught, the most in 2024'
		);
	});

	it('renders record-equalling for-N-years copy', () => {
		expect(
			renderedText(makeSpeciesHighlight({ recordEqualledYearsAgo: 2 }))
		).toBe(
			'Record-equalling day for Reed Warbler — 12 caught, most for 2 years'
		);
	});

	it('renders joint best placement copy', () => {
		expect(
			renderedText(
				makeSpeciesHighlight({ placementRank: 1, isJointPlacement: true })
			)
		).toBe('Joint best day for Reed Warbler ever — 12 birds');
	});

	it('renders second-best placement copy', () => {
		expect(
			renderedText(
				makeSpeciesHighlight({
					placementRank: 2,
					isJointPlacement: false,
					value: 8
				})
			)
		).toBe('Second best day for Reed Warbler ever — 8 birds');
	});

	it('renders third-best placement copy', () => {
		expect(
			renderedText(
				makeSpeciesHighlight({
					placementRank: 3,
					isJointPlacement: false,
					value: 8
				})
			)
		).toBe('Third best day for Reed Warbler ever — 8 birds');
	});

	it('renders joint second-best placement copy', () => {
		expect(
			renderedText(
				makeSpeciesHighlight({
					placementRank: 2,
					isJointPlacement: true,
					value: 8
				})
			)
		).toBe('Joint second best day for Reed Warbler ever — 8 birds');
	});
});

function makeTotalJuvHighlight(
	overrides: Partial<HighlightFields<SessionTotalJuvRecordHighlight>>
): SessionTotalJuvRecordHighlight {
	return {
		type: 'session-total-juv-record',
		scope: 'all-time',
		value: 20,
		year: 2024,
		isCurrentYear: false,
		...overrides
	};
}

describe('render — session-total-juv-record', () => {
	it('renders all-time copy', () => {
		expect(renderedText(makeTotalJuvHighlight({}))).toBe(
			'Most juveniles ever — 20 juvs'
		);
	});

	it('renders current-year this-year copy', () => {
		expect(
			renderedText(
				makeTotalJuvHighlight({ scope: 'this-year', isCurrentYear: true })
			)
		).toBe('Most juveniles this year — 20 juvs');
	});

	it('renders past-year this-year copy with the year', () => {
		expect(renderedText(makeTotalJuvHighlight({ scope: 'this-year' }))).toBe(
			'Most juveniles of 2024 — 20 juvs'
		);
	});

	it('renders for-N-years copy for an all-time tie', () => {
		expect(
			renderedText(makeTotalJuvHighlight({ recordEqualledYearsAgo: 3 }))
		).toBe('Most juveniles for 3 years — 20 juvs');
	});
});

function makeSpeciesJuvHighlight(
	overrides: Partial<HighlightFields<SpeciesJuvCountRecordHighlight>>
): SpeciesJuvCountRecordHighlight {
	return {
		type: 'species-juv-count-record',
		speciesName: 'Reed Warbler',
		scope: 'all-time',
		value: 12,
		year: 2024,
		isCurrentYear: false,
		...overrides
	};
}

describe('render — species-juv-count-record', () => {
	it('renders all-time copy', () => {
		expect(renderedText(makeSpeciesJuvHighlight({}))).toBe(
			'Most juvenile Reed Warbler — 12 caught, the most ever'
		);
	});

	it('renders current-year this-year copy', () => {
		expect(
			renderedText(
				makeSpeciesJuvHighlight({ scope: 'this-year', isCurrentYear: true })
			)
		).toBe('Most juvenile Reed Warbler — 12 caught, the most this year');
	});

	it('renders past-year this-year copy with the year', () => {
		expect(renderedText(makeSpeciesJuvHighlight({ scope: 'this-year' }))).toBe(
			'Most juvenile Reed Warbler — 12 caught, the most in 2024'
		);
	});

	it('renders record-equalling for-N-years copy', () => {
		expect(
			renderedText(makeSpeciesJuvHighlight({ recordEqualledYearsAgo: 2 }))
		).toBe(
			'Record-equalling day for juvenile Reed Warbler — 12 caught, most for 2 years'
		);
	});

	it('renders second-best placement copy', () => {
		expect(
			renderedText(
				makeSpeciesJuvHighlight({
					placementRank: 2,
					isJointPlacement: false,
					value: 8
				})
			)
		).toBe('Second best day for juvenile Reed Warbler ever — 8 birds');
	});

	it('renders joint best placement copy', () => {
		expect(
			renderedText(
				makeSpeciesJuvHighlight({ placementRank: 1, isJointPlacement: true })
			)
		).toBe('Joint best day for juvenile Reed Warbler ever — 12 birds');
	});
});

function makeSinceHighlight(
	overrides: Partial<HighlightFields<SinceComparisonHighlight>> = {}
): SinceComparisonHighlight {
	return {
		type: 'since-comparison',
		kind: 'busiest',
		value: 41,
		sinceDate: '2023-05-12',
		...overrides
	};
}

describe('render — since', () => {
	it('renders busiest-since copy', () => {
		expect(renderedText(makeSinceHighlight())).toBe(
			'Busiest session since 12 May 2023 — 41 birds'
		);
	});

	it('renders quietest-since copy', () => {
		expect(
			renderedText(
				makeSinceHighlight({
					kind: 'quietest',
					value: 3,
					sinceDate: '2023-09-14'
				})
			)
		).toBe('Quietest session since 14 Sep 2023 — 3 birds');
	});

	it('renders quietest-ever copy', () => {
		expect(
			renderedText(
				makeSinceHighlight({ kind: 'quietest', value: 3, sinceDate: undefined })
			)
		).toBe('Quietest session ever — 3 birds');
	});
});

// The combine passes that produce these highlights live in each group's
// rules/ directory; here we only test that each combined variant renders
// its copy.
describe('render — combined-session-total-record', () => {
	const combinedFields = {
		type: 'combined-session-total-record' as const,
		encounterValue: 120,
		speciesValue: 15,
		year: 2026,
		isCurrentYear: true
	};

	it('renders this-year copy for a current-year session', () => {
		expect(renderedText({ ...combinedFields, scope: 'this-year' })).toBe(
			'Busiest and most varied session this year — 120 birds from 15 species'
		);
	});

	it('renders all-time copy', () => {
		expect(renderedText({ ...combinedFields, scope: 'all-time' })).toBe(
			'Busiest and most varied session ever — 120 birds from 15 species'
		);
	});
});

describe('render — combined-species-count-record', () => {
	const combinedFields = {
		type: 'combined-species-count-record' as const,
		year: 2026,
		isCurrentYear: true
	};

	it('renders three this-year species with commas and a trailing "and"', () => {
		expect(
			renderedText({
				...combinedFields,
				scope: 'this-year',
				speciesNames: ["Cetti's Warbler", 'Chiffchaff', 'Whitethroat']
			})
		).toBe(
			"Highest Cetti's Warbler, Chiffchaff and Whitethroat counts of the year"
		);
	});

	it('renders two this-year species joined by "and"', () => {
		expect(
			renderedText({
				...combinedFields,
				scope: 'this-year',
				speciesNames: ['Blue Tit', 'Wren']
			})
		).toBe('Highest Blue Tit and Wren counts of the year');
	});

	it('renders the absolute year for a past-year session', () => {
		expect(
			renderedText({
				...combinedFields,
				scope: 'this-year',
				isCurrentYear: false,
				year: 2024,
				speciesNames: ['Blue Tit', 'Wren']
			})
		).toBe('Highest Blue Tit and Wren counts of 2024');
	});
});

function placementHighlight(
	placementRank: 2 | 3,
	species: { name: string; isJoint: boolean }[]
): CountHighlight {
	return {
		type: 'combined-species-placement-record',
		placementRank,
		species
	};
}

describe('render — combined-species-placement-record', () => {
	it('renders a combined strict 2nd-best placement without a count', () => {
		expect(
			renderedText(
				placementHighlight(2, [
					{ name: 'Dunnock', isJoint: false },
					{ name: 'Whitethroat', isJoint: false }
				])
			)
		).toBe('Second best day for Dunnock and Whitethroat ever');
	});

	it('renders a combined all-joint 2nd-best placement without a count', () => {
		expect(
			renderedText(
				placementHighlight(2, [
					{ name: 'Dunnock', isJoint: true },
					{ name: 'Whitethroat', isJoint: true }
				])
			)
		).toBe('Joint second best day for Dunnock and Whitethroat ever');
	});

	it('renders a mixed 2nd-best placement, flagging the joint species inline', () => {
		expect(
			renderedText(
				placementHighlight(2, [
					{ name: 'Dunnock', isJoint: false },
					{ name: 'Whitethroat', isJoint: true }
				])
			)
		).toBe('Second best day for Dunnock and (tied second) Whitethroat ever');
	});

	it('comma-joins three merged species and phrases the third-best rank', () => {
		expect(
			renderedText(
				placementHighlight(3, [
					{ name: 'Dunnock', isJoint: false },
					{ name: 'Whitethroat', isJoint: false },
					{ name: 'Wren', isJoint: false }
				])
			)
		).toBe('Third best day for Dunnock, Whitethroat and Wren ever');
	});
});
