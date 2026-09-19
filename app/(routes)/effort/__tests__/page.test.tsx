import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import yearlySnapshot from '@/test-fixtures/snapshots/core_stats/alpha.yearly-totals.json';
import monthlySnapshot from '@/test-fixtures/snapshots/core_stats/alpha.monthly-totals.json';
import type { PayOffStatsData } from '@/app/actions/pay-off-stats';

vi.mock('@/app/actions/pay-off-stats', () => ({
	fetchPayOffStats: vi.fn()
}));

// These fixtures are not grouped by species, so species_name is genuinely
// null — PayOffStatsData's underlying CoreStatsResult NonNullable mapped type
// (app/models/db.ts) assumes every column is always present, so a direct
// assertion doesn't compile (#895).
const payOffSnapshot: PayOffStatsData = {
	// eslint-disable-next-line no-restricted-syntax -- see comment above
	yearly: yearlySnapshot as unknown as PayOffStatsData['yearly'],
	// eslint-disable-next-line no-restricted-syntax -- see comment above
	monthly: monthlySnapshot as unknown as PayOffStatsData['monthly']
};

describe('effort page', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchPayOffStats } = await import('@/app/actions/pay-off-stats');
		vi.mocked(fetchPayOffStats).mockResolvedValue(payOffSnapshot);
	});

	it('renders heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('Effort and Pay-off');
	});

	it('renders yearly table columns with year headers from snapshot', async () => {
		render(await Page());
		const table = await screen.findByRole('table');
		const headers = table.querySelectorAll('thead th');
		expect(headers[0].textContent).toBe('Metric');
		expect(headers[1].textContent).toBe('2021');
		expect(headers[2].textContent).toBe('2022');
	});

	it('renders empty yearly state when no data', async () => {
		const { fetchPayOffStats } = await import('@/app/actions/pay-off-stats');
		vi.mocked(fetchPayOffStats).mockResolvedValue({
			yearly: [],
			monthly: []
		} as PayOffStatsData);
		render(await Page());
		await screen.findByText('No yearly data for this group yet.');
	});
});
