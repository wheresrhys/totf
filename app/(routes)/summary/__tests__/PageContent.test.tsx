import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SummaryPageContent } from '../PageContent';
import {
	ALPHA_CORE_STATS_SUMMARY_TOTALS,
	ALPHA_CORE_STATS_BY_SPECIES
} from '@/app/__tests__/helpers/core-stats-fixtures';
import type { ViewedGroup } from '@/app/lib/group-slug';

// Alpha's seed data always has an all-time cell, so this is never actually
// null — the type is nullable only because the real all-time read can
// legitimately return none for a group with no data at all.
const populatedStats = ALPHA_CORE_STATS_SUMMARY_TOTALS!;
const populatedSpeciesStats = ALPHA_CORE_STATS_BY_SPECIES;

const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

const fetchSpeciesDataMock = vi.fn();
vi.mock('@/app/actions/spp-data', () => ({
	fetchSpeciesData: (...args: unknown[]) => fetchSpeciesDataMock(...args)
}));

const fetchPeriodTotalsMock = vi.fn();
vi.mock('@/app/actions/period-totals', () => ({
	fetchPeriodTotals: (...args: unknown[]) => fetchPeriodTotalsMock(...args)
}));

describe('SummaryPageContent', () => {
	beforeEach(() => {
		fetchSpeciesDataMock.mockResolvedValue(populatedSpeciesStats);
		fetchPeriodTotalsMock.mockResolvedValue([populatedStats]);
	});
	afterEach(() => {
		cleanup();
		fetchSpeciesDataMock.mockReset();
		fetchPeriodTotalsMock.mockReset();
	});

	it('renders "All time summary" when neither year nor month is given', async () => {
		render(<SummaryPageContent />);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('All time summary');
	});

	it('renders "{year} summary" when only year is given', async () => {
		render(<SummaryPageContent year={2026} />);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('2026 summary');
	});

	it('renders "{long month} {year} summary" when both year and month are given', async () => {
		render(<SummaryPageContent year={2026} month={8} />);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('August 2026 summary');
	});

	describe('Structure', () => {
		it('renders nothing extra when summaryStats is undefined/null', () => {
			render(<SummaryPageContent summaryStats={null} />);
			expect(screen.queryByTestId('summary-stats-section')).toBeNull();
		});
	});

	describe('summaryStats passthrough', () => {
		it('forwards summaryStats to the lazily-loaded Species totals table as its totals row', async () => {
			render(
				<SummaryPageContent
					summaryStats={populatedStats}
					viewedGroup={viewedGroup}
				/>
			);
			await waitFor(() =>
				expect(screen.getByTestId('totals-row')).toBeTruthy()
			);
		});
	});

	describe('yearlyTotals passthrough', () => {
		it('shows "Year totals" as the default tab when yearlyTotals is passed (all-time page)', () => {
			render(
				<SummaryPageContent
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
			render(<SummaryPageContent year={2026} />);
			expect(screen.queryByRole('button', { name: 'Year totals' })).toBeNull();
			const tab = screen.getByRole('button', { name: 'Species totals' });
			expect(tab.getAttribute('aria-current')).toBe('true');
		});
	});

	describe('initialTabId passthrough (#804)', () => {
		it('a matching initialTabId is active on mount and its lazy fetch fires without a click', async () => {
			render(
				<SummaryPageContent
					viewedGroup={viewedGroup}
					initialTabId="species-totals"
				/>
			);
			const tab = screen.getByRole('button', { name: 'Species totals' });
			expect(tab.getAttribute('aria-current')).toBe('true');
			await waitFor(() => expect(fetchSpeciesDataMock).toHaveBeenCalled());
		});

		it('undefined initialTabId leaves tabs[0].id as the default, unchanged from current behaviour', () => {
			render(
				<SummaryPageContent
					viewedGroup={viewedGroup}
					yearlyTotals={[{ ...populatedStats, time_period: '2026-01-01' }]}
				/>
			);
			const tab = screen.getByRole('button', { name: 'Year totals' });
			expect(tab.getAttribute('aria-current')).toBe('true');
		});

		it("an initialTabId not present in this render's tabs falls back to tabs[0].id", () => {
			render(
				<SummaryPageContent
					viewedGroup={viewedGroup}
					yearlyTotals={[{ ...populatedStats, time_period: '2026-01-01' }]}
					initialTabId="month-totals"
				/>
			);
			const tab = screen.getByRole('button', { name: 'Year totals' });
			expect(tab.getAttribute('aria-current')).toBe('true');
		});
	});
});
