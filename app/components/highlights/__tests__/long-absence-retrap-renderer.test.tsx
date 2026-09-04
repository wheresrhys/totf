import { describe, it, expect } from 'vitest';
import { renderLongAbsenceRetrapHighlight } from '../long-absence-retrap-renderer';
import type { LongAbsenceRetrapHighlight } from '@/app/models/highlights';

// Moved from the old flat app/components/session-highlight-renderers.tsx
// coverage as part of #760's componentized-per-group renderers split —
// long-absence-retrap is a sibling of the three groups, not one of them.

function makeLongAbsenceHighlight(
	overrides: Partial<Omit<LongAbsenceRetrapHighlight, 'type'>> = {}
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

function renderedText(highlight: LongAbsenceRetrapHighlight): string {
	return (
		renderLongAbsenceRetrapHighlight(highlight).props as { children: string }
	).children;
}

describe('render — element shape', () => {
	it('renders a list item keyed by the sentence', () => {
		const element = renderLongAbsenceRetrapHighlight(
			makeLongAbsenceHighlight()
		);
		expect(element.type).toBe('li');
		expect(element.key).toBe(
			'Robin ARRETRAP recaught after 2 years, 10 months away (last seen 20 Jun 2021)'
		);
	});
});

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
