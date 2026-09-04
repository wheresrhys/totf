import { describe, it, expect } from 'vitest';
import { renderVitalStatHighlight } from '../renderers';
import type {
	CombinedWeightRecordHighlight,
	VitalStatHighlight,
	WeightRecordHighlight
} from '@/app/models/highlights';

// Moved from the old flat app/components/session-highlight-renderers.tsx
// coverage as part of #760's componentized-per-group renderers split.

// Overrides for the per-family highlight factories — every field bar the
// fixed `type` discriminant
type HighlightFields<T extends VitalStatHighlight> = Omit<T, 'type'>;

// Each highlight renders <li key={sentence}>{sentence}</li>; the copy tests
// assert on the sentence text
function renderedText(highlight: VitalStatHighlight): string {
	return (renderVitalStatHighlight(highlight).props as { children: string })
		.children;
}

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

describe('render — element shape', () => {
	it('renders a list item keyed by the sentence', () => {
		const element = renderVitalStatHighlight(makeWeightHighlight());
		expect(element.type).toBe('li');
		expect(element.key).toBe('Heaviest Blue Tit ever weighed — 13.1g');
	});
});

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
