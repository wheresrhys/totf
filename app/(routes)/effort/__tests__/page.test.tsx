import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import payOffSnapshot from '@/test-fixtures/snapshots/core_stats/alpha.yearly-and-monthly-totals.json';
import type { PayOffStatsData } from '@/app/actions/pay-off-stats';

vi.mock('@/app/actions/pay-off-stats', () => ({
	fetchPayOffStats: vi.fn()
}));

describe('effort page', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchPayOffStats } = await import('@/app/actions/pay-off-stats');
		vi.mocked(fetchPayOffStats).mockResolvedValue(
			// Kept as `as unknown as`: this fixture is not grouped by species, so
			// species_name is genuinely null — CoreStatsResult's NonNullable mapped
			// type (app/models/db.ts) assumes every column is always present, so a
			// direct assertion doesn't compile (#895).
			payOffSnapshot as unknown as PayOffStatsData
		);
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
