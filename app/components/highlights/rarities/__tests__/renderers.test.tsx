import { describe, it, expect } from 'vitest';
import { renderRarityHighlight } from '../renderers';
import type {
	FirstEverSpeciesHighlight,
	FirstOfYearSpeciesHighlight,
	RareSpeciesHighlight,
	RarityHighlight
} from '@/app/models/highlights';

// Moved from the old flat app/components/session-highlight-renderers.tsx
// coverage as part of #760's componentized-per-group renderers split.

// Overrides for the per-family highlight factories — every field bar the
// fixed `type` discriminant
type HighlightFields<T extends RarityHighlight> = Omit<T, 'type'>;

// Each highlight renders <li key={sentence}>{sentence}</li>; the copy tests
// assert on the sentence text
function renderedText(highlight: RarityHighlight): string {
	return (renderRarityHighlight(highlight).props as { children: string })
		.children;
}

describe('render — element shape', () => {
	it('renders a list item keyed by the sentence', () => {
		const highlight: RareSpeciesHighlight = {
			type: 'rare-species',
			speciesName: 'Firecrest',
			totalSessionDays: 2
		};
		const element = renderRarityHighlight(highlight);
		expect(element.type).toBe('li');
		expect(element.key).toBe('MEGA — Firecrest seen on only 2 days ever');
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

describe('render — mega-species', () => {
	it('renders a MEGA line for an only-of-year record folded with rarity', () => {
		expect(
			renderedText({
				type: 'mega-species',
				base: {
					type: 'first-of-year-species',
					speciesName: 'Meadow Pipit',
					year: 2023,
					isCurrentYear: false,
					multipleIndividualsRecorded: true,
					isOnlyRecord: true
				},
				totalSessionDays: 3
			})
		).toBe('MEGA — Only Meadow Pipit records of 2023 (only 3 records ever)');
	});

	it('renders a MEGA line for a first-of-year record folded with rarity', () => {
		expect(
			renderedText({
				type: 'mega-species',
				base: {
					type: 'first-of-year-species',
					speciesName: 'Meadow Pipit',
					year: 2023,
					isCurrentYear: false,
					multipleIndividualsRecorded: true,
					isOnlyRecord: false
				},
				totalSessionDays: 3
			})
		).toBe('MEGA — First Meadow Pipit records of 2023 (only 3 records ever)');
	});

	it('renders a MEGA line for an only-ever record without a rarity note', () => {
		expect(
			renderedText({
				type: 'mega-species',
				base: {
					type: 'first-ever-species',
					speciesName: 'Meadow Pipit',
					multipleIndividualsRecorded: false,
					isOnlyRecord: true
				},
				totalSessionDays: 1
			})
		).toBe('MEGA — Only Meadow Pipit record ever');
	});

	it('renders a MEGA line for a first-ever record, counting the other occasions', () => {
		expect(
			renderedText({
				type: 'mega-species',
				base: {
					type: 'first-ever-species',
					speciesName: 'Meadow Pipit',
					multipleIndividualsRecorded: false,
					isOnlyRecord: false
				},
				totalSessionDays: 3
			})
		).toBe(
			'MEGA — First Meadow Pipit ever (only recorded on 2 other occasions)'
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
