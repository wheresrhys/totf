import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SummaryPage } from '../_shared';
import alphaStats from '@/test-fixtures/snapshots/fetchSummaryStats.alpha.json';
import alphaSpeciesStats from '@/test-fixtures/snapshots/fetchSpeciesData.alpha.json';
import type { AggregateStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/lib/group-slug';

const populatedStats = alphaStats as unknown as AggregateStatsResult;
const populatedSpeciesStats =
	alphaSpeciesStats as unknown as AggregateStatsResult[];

const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

const fetchSpeciesDataMock = vi.fn();
vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: (...args: unknown[]) => fetchSpeciesDataMock(...args)
}));

describe('SummaryPage', () => {
	beforeEach(() => {
		fetchSpeciesDataMock.mockResolvedValue(populatedSpeciesStats);
	});
	afterEach(() => {
		cleanup();
		fetchSpeciesDataMock.mockReset();
	});

	it('renders "All time summary" when neither year nor month is given', async () => {
		render(<SummaryPage />);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('All time summary');
	});

	it('renders "{year} summary" when only year is given', async () => {
		render(<SummaryPage year={2026} />);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('2026 summary');
	});

	it('renders "{long month} {year} summary" when both year and month are given', async () => {
		render(<SummaryPage year={2026} month={8} />);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('August 2026 summary');
	});

	it('renders the youngest-age-category note immediately after the heading on the all-time page', async () => {
		render(<SummaryPage />);
		const heading = await screen.findByRole('heading', { level: 1 });
		const note = screen.getByText(
			'Note that birds are counted in the youngest age category they were recorded in'
		);
		expect(heading.nextElementSibling).toBe(note);
	});

	describe('Structure', () => {
		it('renders nothing extra when summaryStats is undefined/null', () => {
			render(<SummaryPage summaryStats={null} />);
			expect(screen.queryByTestId('summary-stats-section')).toBeNull();
		});

		it('does not render the youngest-age-category note when year is given', () => {
			render(<SummaryPage year={2026} />);
			expect(
				screen.queryByText(
					'Note that birds are counted in the youngest age category they were recorded in'
				)
			).toBeNull();
		});

		it('does not render the youngest-age-category note when year and month are given', () => {
			render(<SummaryPage year={2026} month={8} />);
			expect(
				screen.queryByText(
					'Note that birds are counted in the youngest age category they were recorded in'
				)
			).toBeNull();
		});
	});

	describe('Edge', () => {
		it('renders no session links even with populated stats/species (species-name links are expected)', async () => {
			render(
				<SummaryPage summaryStats={populatedStats} viewedGroup={viewedGroup} />
			);
			// Species is the sole/default tab here; wait for the lazy fetch to render
			await waitFor(() =>
				expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(0)
			);
			const links = screen.getAllByRole('link');
			expect(links.length).toBeGreaterThan(0);
			links.forEach((link) => {
				expect(link.getAttribute('href')).not.toMatch(/^\/group\/.+\/session/);
			});
		});
	});

	describe('summaryStats passthrough', () => {
		it('forwards summaryStats to the lazily-loaded Species totals table as its totals row', async () => {
			render(
				<SummaryPage summaryStats={populatedStats} viewedGroup={viewedGroup} />
			);
			await waitFor(() =>
				expect(screen.getByTestId('totals-row')).toBeTruthy()
			);
		});
	});

	describe('yearlyTotals passthrough', () => {
		it('shows "Year totals" as the default tab when yearlyTotals is passed (all-time page)', () => {
			render(
				<SummaryPage
					viewedGroup={viewedGroup}
					yearlyTotals={[{ ...populatedStats, time_period: '2026-01-01' }]}
				/>
			);
			const tab = screen.getByRole('button', { name: 'Year totals' });
			expect(tab.getAttribute('aria-current')).toBe('true');
			expect(
				screen.getByRole('button', { name: 'Species totals' })
			).toBeTruthy();
		});

		it('keeps "Species totals" as the sole/default tab when yearlyTotals is omitted (year/month pages)', () => {
			// No viewedGroup: asserts tab structure only, so the lazy species fetch
			// stays inert (no async state update to wrap in act).
			render(<SummaryPage year={2026} />);
			expect(screen.queryByRole('button', { name: 'Year totals' })).toBeNull();
			const tab = screen.getByRole('button', { name: 'Species totals' });
			expect(tab.getAttribute('aria-current')).toBe('true');
		});
	});
});
