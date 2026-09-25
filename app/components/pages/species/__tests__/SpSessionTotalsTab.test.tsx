import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SpSessionTotalsTab } from '../SpSessionTotalsTab';
import type { CoreStatsResult } from '@/app/models/db';
import { buildDailyStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

vi.mock('@/app/actions/sp-data', () => ({
	fetchSpeciesPeriodTotals: vi.fn()
}));

const viewedGroup = { id: 1, slug: 'alpha' };

describe('SpSessionTotalsTab', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
			buildDailyStatsRow({ time_period: '2026-03-14' }),
			buildDailyStatsRow({ time_period: '2026-03-21' })
		]);
	});

	it('shows a loading spinner while data is fetching', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		let resolveData!: (v: CoreStatsResult[]) => void;
		vi.mocked(fetchSpeciesPeriodTotals).mockReturnValue(
			new Promise((resolve) => {
				resolveData = resolve;
			})
		);
		render(
			<SpSessionTotalsTab speciesName="Robin" viewedGroup={viewedGroup} />
		);
		expect(document.querySelector('.loading')).toBeDefined();
		resolveData([]);
	});

	it('fetches day-grouped totals scoped to the species, with no date range, on the all-time page', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		render(
			<SpSessionTotalsTab speciesName="Robin" viewedGroup={viewedGroup} />
		);
		await waitFor(() => {
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});
		expect(fetchSpeciesPeriodTotals).toHaveBeenCalledWith(
			'Robin',
			1,
			'day',
			undefined,
			undefined
		);
	});

	it('fetches day-grouped totals scoped to the species and the given date range, on the year page', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		render(
			<SpSessionTotalsTab
				speciesName="Robin"
				viewedGroup={viewedGroup}
				fromDate="2026-01-01"
				toDate="2026-12-31"
			/>
		);
		await waitFor(() => {
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});
		expect(fetchSpeciesPeriodTotals).toHaveBeenCalledWith(
			'Robin',
			1,
			'day',
			'2026-01-01',
			'2026-12-31'
		);
	});

	it('renders a row per day returned by the RPC, each linking to /group/{slug}/session/{date}', async () => {
		render(
			<SpSessionTotalsTab speciesName="Robin" viewedGroup={viewedGroup} />
		);
		await waitFor(() => {
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
		});
		const march14Link = screen.getByRole('link', { name: '14th March 2026' });
		const march21Link = screen.getByRole('link', { name: '21st March 2026' });
		expect(march14Link.getAttribute('href')).toBe(
			'/group/alpha/session/2026-03-14'
		);
		expect(march21Link.getAttribute('href')).toBe(
			'/group/alpha/session/2026-03-21'
		);
	});

	it("renders through PeriodTotalsTable with timeInterval='day'", async () => {
		render(
			<SpSessionTotalsTab speciesName="Robin" viewedGroup={viewedGroup} />
		);
		await waitFor(() => {
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});
		// Day-grouped rows format their label as "do MMMM yyyy" (e.g. "14th March
		// 2026"), distinct from year/month timeInterval's formatting — confirms
		// `timeInterval="day"` was actually threaded through to `PeriodTotalsTable`.
		expect(screen.getByRole('link', { name: '14th March 2026' })).toBeTruthy();
	});

	it('does not render a "Busiest session" column', async () => {
		render(
			<SpSessionTotalsTab speciesName="Robin" viewedGroup={viewedGroup} />
		);
		await waitFor(() => {
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});
		expect(
			screen.queryByRole('columnheader', { name: 'Busiest session' })
		).toBeNull();
	});

	it("renders the table's empty state when the species has no sessions in range, without crashing", async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([]);
		render(
			<SpSessionTotalsTab speciesName="Robin" viewedGroup={viewedGroup} />
		);
		await waitFor(() => {
			expect(screen.getByText('No data recorded.')).toBeTruthy();
		});
	});
});
