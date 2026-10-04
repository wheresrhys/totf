import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ResightingsPageContent } from '../PageContent';
import type { ResightingEncounter } from '@/app/models/session';

function makeResighting(
	ringNo: string,
	speciesName: string,
	visitDate: string
): ResightingEncounter {
	return {
		id: Number(ringNo.replace(/\D/g, '')),
		record_type: 'U',
		extra_text: null,
		finding_condition: null,
		finding_circumstances: null,
		bird: {
			ring_no: ringNo,
			species: { species_name: speciesName }
		},
		visit_date: visitDate,
		location: { location_name: 'Test Site' }
	} as ResightingEncounter;
}

// Ring order and visit-date order deliberately disagree, so a table sorted by
// Ring is distinguishable from one on its default visit-date-descending sort.
const resightings = [
	makeResighting('RING1', 'Blue Tit', '2024-01-01'),
	makeResighting('RING2', 'Robin', '2024-01-02'),
	makeResighting('RING3', 'Blue Tit', '2024-01-03')
];

function renderPageContent(initialTabId?: string) {
	return render(
		<ResightingsPageContent
			data={resightings}
			viewedGroup={{ id: 1, slug: 'alpha' }}
			initialTabId={initialTabId}
		/>
	);
}

function getTabLabels(): (string | null)[] {
	return [...screen.getByRole('tablist').querySelectorAll('button')].map(
		(button) => button.textContent
	);
}

function clickTab(label: string): void {
	const tab = [...screen.getByRole('tablist').querySelectorAll('button')].find(
		(button) => button.textContent === label
	)!;
	fireEvent.click(tab);
}

// `getByRole('table')` only ever sees the active tab's table: an inactive but
// already-loaded panel stays mounted behind `aria-hidden="true"`, which the
// accessibility-tree-aware role queries skip.
function getVisibleRingCellTexts(): string[] {
	return [...screen.getByRole('table').querySelectorAll('tbody tr')].map(
		(row) => row.querySelector('td')!.textContent!.trim()
	);
}

function clickVisibleColumnHeading(headingText: string): void {
	const heading = [
		...screen.getByRole('table').querySelectorAll('thead th')
	].find((th) => th.textContent?.includes(headingText))!;
	fireEvent.click(heading);
}

describe('ResightingsPageContent TabSet wiring', () => {
	afterEach(() => {
		cleanup();
	});

	describe('tab list construction', () => {
		it('builds one tab per species key from groupResightingsBySpecies, with "All" first', () => {
			renderPageContent();
			expect(getTabLabels()).toEqual(['All', 'Blue Tit', 'Robin']);
		});
	});

	describe('switching tabs', () => {
		it("shows the selected species' table and hides the others when a different tab is clicked", () => {
			renderPageContent();
			clickTab('Robin');
			expect(getVisibleRingCellTexts()).toEqual(['RING2']);
		});

		it("does not remount a previously-visited tab's table when switching back to it", () => {
			renderPageContent();
			// Re-sort the "All" table away from its default visit-date-descending
			// order; the sort lives in `SortableTable`'s own state, so it only
			// survives a round-trip through another tab if the panel stayed mounted.
			clickVisibleColumnHeading('Ring');
			expect(getVisibleRingCellTexts()).toEqual(['RING1', 'RING2', 'RING3']);

			clickTab('Robin');
			clickTab('All');

			expect(getVisibleRingCellTexts()).toEqual(['RING1', 'RING2', 'RING3']);
		});
	});

	describe('initialTabId', () => {
		it('opens the server-resolved tab instead of "All"', () => {
			renderPageContent('Robin');
			expect(getVisibleRingCellTexts()).toEqual(['RING2']);
		});
	});
});
