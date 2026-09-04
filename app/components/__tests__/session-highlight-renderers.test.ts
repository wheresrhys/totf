import { describe, it, expect } from 'vitest';
import { renderHighlight } from '../session-highlight-renderers';
import type {
	CombinedWeightRecordHighlight,
	FirstEverSpeciesHighlight,
	FirstOfYearSpeciesHighlight,
	LongAbsenceRetrapHighlight,
	RareSpeciesHighlight,
	SessionHighlight,
	SessionTotalJuvRecordHighlight,
	SessionTotalRecordHighlight,
	SinceComparisonHighlight,
	SpeciesCountRecordHighlight,
	SpeciesJuvCountRecordHighlight,
	WeightRecordHighlight
} from '@/app/models/highlights';

// Moved from app/models/__tests__/session-highlights.test.ts as part of
// #409's model-layer restructure — these test the renderer
// (session-highlight-renderers.tsx), which #409 doesn't otherwise touch, so
// they're filed under the component they exercise rather than split across
// the new per-group model test directories.

// Overrides for the per-family highlight factories — every field bar the
// fixed `type` discriminant
type HighlightFields<T extends SessionHighlight> = Omit<T, 'type'>;

// Each highlight renders <li key={sentence}>{sentence}</li>; the copy tests
// assert on the sentence text
function renderedText(highlight: SessionHighlight): string {
	return (renderHighlight(highlight).props as { children: string }).children;
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
		const element = renderHighlight(makeHighlight({}));
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

const FIRECREST = 'Firecrest';

function makeRareSpeciesHighlight(
	overrides: Partial<HighlightFields<RareSpeciesHighlight>> = {}
): RareSpeciesHighlight {
	return {
		type: 'rare-species',
		speciesName: FIRECREST,
		totalSessionDays: 2,
		...overrides
	};
}

describe('render — rare-species', () => {
	it('renders the total session-day count', () => {
		expect(renderedText(makeRareSpeciesHighlight())).toBe(
			'MEGA — Firecrest seen on only 2 days ever'
		);
	});

	it('renders a three-day count', () => {
		expect(
			renderedText(makeRareSpeciesHighlight({ totalSessionDays: 3 }))
		).toBe('MEGA — Firecrest seen on only 3 days ever');
	});
});

function makeFirstEverHighlight(
	overrides: Partial<HighlightFields<FirstEverSpeciesHighlight>> = {}
): FirstEverSpeciesHighlight {
	return {
		type: 'first-ever-species',
		speciesName: 'Firecrest',
		multipleIndividualsRecorded: false,
		isOnlyRecord: false,
		...overrides
	};
}

describe('render — first-ever-species', () => {
	it('renders first-ever copy', () => {
		expect(renderedText(makeFirstEverHighlight())).toBe(
			'First ever Firecrest record'
		);
	});

	it('renders plural first-ever copy for multiple individuals', () => {
		expect(
			renderedText(
				makeFirstEverHighlight({ multipleIndividualsRecorded: true })
			)
		).toBe('First ever Firecrest records');
	});

	it('renders only-record copy when the session holds the only record', () => {
		expect(renderedText(makeFirstEverHighlight({ isOnlyRecord: true }))).toBe(
			'Only Firecrest record ever'
		);
	});

	it('renders plural only-record copy for multiple individuals', () => {
		expect(
			renderedText(
				makeFirstEverHighlight({
					isOnlyRecord: true,
					multipleIndividualsRecorded: true
				})
			)
		).toBe('Only Firecrest records ever');
	});
});

function makeFirstOfYearHighlight(
	overrides: Partial<HighlightFields<FirstOfYearSpeciesHighlight>> = {}
): FirstOfYearSpeciesHighlight {
	return {
		type: 'first-of-year-species',
		speciesName: 'Firecrest',
		year: 2024,
		isCurrentYear: false,
		multipleIndividualsRecorded: false,
		isOnlyRecord: false,
		...overrides
	};
}

describe('render — first-of-year-species', () => {
	it('renders "of the year" copy while the session year is current', () => {
		expect(
			renderedText(makeFirstOfYearHighlight({ isCurrentYear: true }))
		).toBe('First Firecrest record of the year');
	});

	it('renders the absolute year once the session year has passed', () => {
		expect(renderedText(makeFirstOfYearHighlight())).toBe(
			'First Firecrest record of 2024'
		);
	});

	it('renders plural first-of-year copy for multiple individuals', () => {
		expect(
			renderedText(
				makeFirstOfYearHighlight({ multipleIndividualsRecorded: true })
			)
		).toBe('First Firecrest records of 2024');
	});

	it('renders only-record copy while the session year is current', () => {
		expect(
			renderedText(
				makeFirstOfYearHighlight({ isCurrentYear: true, isOnlyRecord: true })
			)
		).toBe('Only Firecrest record of the year');
	});

	it('renders plural only-record copy once the session year has passed', () => {
		expect(
			renderedText(
				makeFirstOfYearHighlight({
					isOnlyRecord: true,
					multipleIndividualsRecorded: true
				})
			)
		).toBe('Only Firecrest records of 2024');
	});
});

function makeLongAbsenceHighlight(
	overrides: Partial<HighlightFields<LongAbsenceRetrapHighlight>> = {}
): LongAbsenceRetrapHighlight {
	return {
		type: 'long-absence-retrap',
		ringNo: 'ARRETRAP',
		speciesName: 'Robin',
		previousDate: '2021-06-20',
		gapYears: 2,
		gapMonths: 10,
		...overrides
	};
}

describe('render — long-absence-retrap', () => {
	it('formats the gap as years and months with the previous date', () => {
		expect(renderedText(makeLongAbsenceHighlight())).toBe(
			'Robin ARRETRAP recaught after 2 years, 10 months away (last seen 20 Jun 2021)'
		);
	});

	it('formats a whole-year gap without a months clause', () => {
		expect(
			renderedText(makeLongAbsenceHighlight({ gapYears: 3, gapMonths: 0 }))
		).toBe(
			'Robin ARRETRAP recaught after 3 years away (last seen 20 Jun 2021)'
		);
	});
});

const BLUE_TIT = 'Blue Tit';

function makeWeightHighlight(
	overrides: Partial<HighlightFields<WeightRecordHighlight>> = {}
): WeightRecordHighlight {
	return {
		type: 'weight-record',
		speciesName: BLUE_TIT,
		scope: 'all-time',
		extreme: 'heaviest',
		weight: 13.1,
		placementRank: 1,
		isJointPlacement: false,
		year: 2024,
		isCurrentYear: false,
		...overrides
	};
}

describe('render — weight-record', () => {
	it('renders heaviest-ever copy for a 1st placement', () => {
		expect(renderedText(makeWeightHighlight())).toBe(
			'Heaviest Blue Tit ever weighed — 13.1g'
		);
	});

	it('renders lightest-ever copy for a 1st placement', () => {
		expect(
			renderedText(makeWeightHighlight({ extreme: 'lightest', weight: 9.8 }))
		).toBe('Lightest Blue Tit ever weighed — 9.8g');
	});

	it('renders 2nd-heaviest copy', () => {
		expect(
			renderedText(makeWeightHighlight({ placementRank: 2, weight: 12.9 }))
		).toBe('2nd-heaviest Blue Tit ever weighed — 12.9g');
	});

	it('renders 3rd-lightest copy', () => {
		expect(
			renderedText(
				makeWeightHighlight({
					extreme: 'lightest',
					placementRank: 3,
					weight: 10.4
				})
			)
		).toBe('3rd-lightest Blue Tit ever weighed — 10.4g');
	});

	it('renders joint heaviest copy for a 1st-place tie', () => {
		expect(renderedText(makeWeightHighlight({ isJointPlacement: true }))).toBe(
			'Joint heaviest Blue Tit ever weighed — 13.1g'
		);
	});

	it('renders joint 2nd-heaviest copy', () => {
		expect(
			renderedText(
				makeWeightHighlight({
					placementRank: 2,
					isJointPlacement: true,
					weight: 12.9
				})
			)
		).toBe('Joint 2nd-heaviest Blue Tit ever weighed — 12.9g');
	});

	it('renders heaviest-of-the-year copy while the year is current', () => {
		expect(
			renderedText(
				makeWeightHighlight({ scope: 'this-year', isCurrentYear: true })
			)
		).toBe('Heaviest Blue Tit weighed this year — 13.1g');
	});

	it('renders heaviest-in-year copy once the year is past', () => {
		expect(
			renderedText(
				makeWeightHighlight({
					scope: 'this-year',
					year: 2024,
					isCurrentYear: false
				})
			)
		).toBe('Heaviest Blue Tit weighed in 2024 — 13.1g');
	});

	it('renders lightest-of-the-year copy', () => {
		expect(
			renderedText(
				makeWeightHighlight({
					scope: 'this-year',
					extreme: 'lightest',
					weight: 9.8,
					isCurrentYear: true
				})
			)
		).toBe('Lightest Blue Tit weighed this year — 9.8g');
	});

	it('renders joint heaviest-of-the-year copy', () => {
		expect(
			renderedText(
				makeWeightHighlight({
					scope: 'this-year',
					isJointPlacement: true,
					isCurrentYear: true
				})
			)
		).toBe('Joint heaviest Blue Tit weighed this year — 13.1g');
	});
});

function makeCombinedWeightHighlight(
	overrides: Partial<HighlightFields<CombinedWeightRecordHighlight>> = {}
): CombinedWeightRecordHighlight {
	return {
		type: 'combined-weight-record',
		speciesName: BLUE_TIT,
		extreme: 'heaviest',
		weight: 13.1,
		year: 2024,
		isCurrentYear: false,
		thisYearIsJoint: false,
		allTimeRank: 2,
		allTimeIsJoint: false,
		...overrides
	};
}

describe('render — combined-weight-record', () => {
	it('leads with the year claim and carries the all-time placement in parens', () => {
		expect(renderedText(makeCombinedWeightHighlight())).toBe(
			'Heaviest Blue Tit weighed in 2024 (2nd heaviest ever) — 13.1g'
		);
	});

	it('uses "this year" while the year is current', () => {
		expect(
			renderedText(makeCombinedWeightHighlight({ isCurrentYear: true }))
		).toBe('Heaviest Blue Tit weighed this year (2nd heaviest ever) — 13.1g');
	});

	it('renders a 3rd-ever placement', () => {
		expect(renderedText(makeCombinedWeightHighlight({ allTimeRank: 3 }))).toBe(
			'Heaviest Blue Tit weighed in 2024 (3rd heaviest ever) — 13.1g'
		);
	});

	it('renders the lightest extreme symmetrically', () => {
		expect(
			renderedText(
				makeCombinedWeightHighlight({ extreme: 'lightest', weight: 9.8 })
			)
		).toBe('Lightest Blue Tit weighed in 2024 (2nd lightest ever) — 9.8g');
	});

	it('marks a joint year leader with "Joint"', () => {
		expect(
			renderedText(makeCombinedWeightHighlight({ thisYearIsJoint: true }))
		).toBe(
			'Joint heaviest Blue Tit weighed in 2024 (2nd heaviest ever) — 13.1g'
		);
	});

	it('marks a joint all-time placement inside the parens', () => {
		expect(
			renderedText(makeCombinedWeightHighlight({ allTimeIsJoint: true }))
		).toBe(
			'Heaviest Blue Tit weighed in 2024 (joint 2nd heaviest ever) — 13.1g'
		);
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

describe('render — combined-only-of-year', () => {
	it('renders three species with commas and a trailing "and"', () => {
		expect(
			renderedText({
				type: 'combined-only-of-year',
				speciesNames: ['Chaffinch', 'Goldfinch', 'Lesser Whitethroat'],
				year: 2026,
				isCurrentYear: true
			})
		).toBe(
			'Only Chaffinch, Goldfinch and Lesser Whitethroat records of the year'
		);
	});

	it('renders two species joined by "and"', () => {
		expect(
			renderedText({
				type: 'combined-only-of-year',
				speciesNames: ['Chaffinch', 'Goldfinch'],
				year: 2026,
				isCurrentYear: true
			})
		).toBe('Only Chaffinch and Goldfinch records of the year');
	});

	it('renders the absolute year for a past-year session', () => {
		expect(
			renderedText({
				type: 'combined-only-of-year',
				speciesNames: ['Chaffinch', 'Goldfinch'],
				year: 2024,
				isCurrentYear: false
			})
		).toBe('Only Chaffinch and Goldfinch records of 2024');
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

describe('render — combined-first-ever', () => {
	it('renders three species with commas and a trailing "and"', () => {
		expect(
			renderedText({
				type: 'combined-first-ever',
				speciesNames: ['Blackbird', 'Blackcap', "Cetti's Warbler"]
			})
		).toBe("First ever Blackbird, Blackcap and Cetti's Warbler records");
	});

	it('renders two species joined by "and"', () => {
		expect(
			renderedText({
				type: 'combined-first-ever',
				speciesNames: ['Blackbird', 'Blackcap']
			})
		).toBe('First ever Blackbird and Blackcap records');
	});

	it('always reads "records" (plural) regardless of the merged parts', () => {
		// The combined line covers at least two species, so the copy is fixed
		// plural even when each source highlight was singular
		expect(
			renderedText({
				type: 'combined-first-ever',
				speciesNames: ['Blackbird', 'Blackcap']
			})
		).toMatch(/records$/);
	});
});

describe('render — combined-first-of-year', () => {
	it('renders three species with commas and a trailing "and"', () => {
		expect(
			renderedText({
				type: 'combined-first-of-year',
				speciesNames: ['Blackbird', 'Blackcap', "Cetti's Warbler"],
				year: 2026,
				isCurrentYear: true
			})
		).toBe("First Blackbird, Blackcap and Cetti's Warbler records of the year");
	});

	it('renders two species joined by "and"', () => {
		expect(
			renderedText({
				type: 'combined-first-of-year',
				speciesNames: ['Blackbird', 'Blackcap'],
				year: 2026,
				isCurrentYear: true
			})
		).toBe('First Blackbird and Blackcap records of the year');
	});

	it('renders the absolute year for a past-year session', () => {
		expect(
			renderedText({
				type: 'combined-first-of-year',
				speciesNames: ['Blackbird', 'Blackcap'],
				year: 2024,
				isCurrentYear: false
			})
		).toBe('First Blackbird and Blackcap records of 2024');
	});

	it('always reads "records" (plural) regardless of the merged parts', () => {
		expect(
			renderedText({
				type: 'combined-first-of-year',
				speciesNames: ['Blackbird', 'Blackcap'],
				year: 2026,
				isCurrentYear: true
			})
		).toMatch(/records of the year$/);
	});
});
