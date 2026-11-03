import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import {
	ALPHA_CORE_STATS_YEARLY_TOTALS,
	ALPHA_CORE_STATS_MONTHLY_TOTALS
} from '@/app/__tests__/helpers/core-stats-fixtures';
import type { PayOffStatsData } from '@/app/actions/pay-off-stats';

vi.mock('@/app/actions/pay-off-stats', () => ({
	fetchPayOffStats: vi.fn()
}));

const payOffSnapshot: PayOffStatsData = {
	yearly: ALPHA_CORE_STATS_YEARLY_TOTALS,
	monthly: ALPHA_CORE_STATS_MONTHLY_TOTALS
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
