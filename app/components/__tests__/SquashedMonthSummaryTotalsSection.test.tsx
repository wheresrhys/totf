import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	getAllByRole,
	waitFor
} from '@testing-library/react';
import { SquashedMonthSummaryTotalsSection } from '../SquashedMonthSummaryTotalsSection';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';
import {
	buildCoreStatsRow,
	buildDailyStatsRow
} from '@/app/__tests__/helpers/core-stats-fixtures';

vi.mock('@/modules/highlights', () => ({
	getHighlightsWithinTimeWindow: vi.fn()
}));

const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

const speciesTotalsForMonth = [
	{ ...buildCoreStatsRow({ species_name: 'Robin' }) } as SpeciesStatsRow
];

const yearTotalsForMonth = [
	buildCoreStatsRow({ time_period: '2024-01-01' }),
	buildCoreStatsRow({ time_period: '2025-01-01' })
];

const sessionTotalsForMonth = [
	buildDailyStatsRow({ time_period: '2025-01-16' })
];

function renderSection({
	squashedMonth = 1,
	speciesTotals = speciesTotalsForMonth,
	yearTotals = yearTotalsForMonth,
	sessionTotals = sessionTotalsForMonth,
	initialTabId,
	initialTabData
}: {
	squashedMonth?: number;
	speciesTotals?: SpeciesStatsRow[];
	yearTotals?: typeof yearTotalsForMonth;
	sessionTotals?: typeof sessionTotalsForMonth;
	initialTabId?: string;
	initialTabData?: { tabId: string; data: unknown };
} = {}) {
	return render(
		<SquashedMonthSummaryTotalsSection
			squashedMonth={squashedMonth}
			speciesTotalsForMonth={speciesTotals}
			yearTotalsForMonth={yearTotals}
			sessionTotalsForMonth={sessionTotals}
			viewedGroup={viewedGroup}
			initialTabId={initialTabId}
			initialTabData={initialTabData}
		/>
	);
}

/**
 * Tabs now mount once and stay mounted-but-hidden behind an `aria-hidden`
 * wrapper rather than unmounting on every switch, so "is on screen" is no
 * longer the same question as "is in the DOM".
 */
function visibleElementsByText(text: string) {
	return screen
		.queryAllByText(text)
		.filter((element) => !element.closest('[aria-hidden="true"]'));
}

function selectTab(name: string) {
	fireEvent.click(screen.getByRole('button', { name }));
}

describe('SquashedMonthSummaryTotalsSection', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('renders Species totals, Year totals, Session totals, Highlights in that order, Species totals active by default', () => {
		renderSection();
		const tabs = getAllByRole(screen.getByRole('tablist'), 'button');
		expect(tabs.map((tab) => tab.textContent)).toEqual([
			'Species totals',
			'Year totals',
			'Session totals',
			'Highlights'
		]);
		expect(tabs[0].getAttribute('aria-current')).toBe('true');
	});

	it('renders the species table by default, linking each species name to the squashed-month species page', () => {
		renderSection();
		expect(
			screen.getByRole('link', { name: 'Robin' }).getAttribute('href')
		).toBe('/species/Robin/jan');
	});

	describe('Year totals tab', () => {
		it('labels each row "{month name} {year}" and links into the specific year/month summary page', () => {
			renderSection();
			selectTab('Year totals');
			expect(
				screen.getByRole('link', { name: 'January 2024' }).getAttribute('href')
			).toBe('/group/alpha/summary/2024/1');
			expect(
				screen.getByRole('link', { name: 'January 2025' }).getAttribute('href')
			).toBe('/group/alpha/summary/2025/1');
		});

		it('uses the requested squashed month for every row regardless of its own bucket month', () => {
			renderSection({ squashedMonth: 12 });
			selectTab('Year totals');
			expect(
				screen.getByRole('link', { name: 'December 2024' }).getAttribute('href')
			).toBe('/group/alpha/summary/2024/12');
		});
	});

	describe('Session totals tab', () => {
		it('links each session day to the group-scoped session route', () => {
			renderSection();
			selectTab('Session totals');
			expect(
				screen
					.getByRole('link', { name: '16th January 2025' })
					.getAttribute('href')
			).toBe('/group/alpha/session/2025-01-16');
		});
	});

	describe('Highlights tab', () => {
		it('shows a loading state before the fetch resolves, then renders the fetched highlights', async () => {
			renderSection();
			selectTab('Highlights');
			expect(document.querySelector('.loading-spinner')).not.toBeNull();
			await waitFor(() =>
				expect(screen.getByText(/Busiest session/)).toBeTruthy()
			);
		});

		// it('scopes the fetch to the requested squashed month across every year', async () => {
		// 	renderSection({ squashedMonth: 12 });
		// 	selectTab('Highlights');
		// 	await waitFor(async () =>
		// 		expect(await mockedHighlightsFetch()).toHaveBeenCalledWith({
		// 			temporalUnit: 'day',
		// 			groupId: 1,
		// 			parentTimeWindow: { month: 12 },
		// 			includePerSpecies: false
		// 		})
		// 	);
		// });
	});

	describe('Edge', () => {
		it('renders the shared empty state for each eager tab when its rows are empty', () => {
			renderSection({ speciesTotals: [], yearTotals: [], sessionTotals: [] });
			expect(visibleElementsByText('No species recorded.')).toHaveLength(1);
			selectTab('Year totals');
			expect(visibleElementsByText('No data recorded.')).toHaveLength(1);
			selectTab('Session totals');
			expect(visibleElementsByText('No data recorded.')).toHaveLength(1);
		});
	});
});
