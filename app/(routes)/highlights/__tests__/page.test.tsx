import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';

const { mockGetTopStats } = vi.hoisted(() => ({
	mockGetTopStats: vi.fn()
}));

vi.mock('@/app/actions/top-performers', () => ({
	getTopStats: mockGetTopStats
}));

describe('highlights page', () => {
	afterEach(() => {
		cleanup();
		mockGetTopStats.mockReset();
	});

	it('renders a "Highlights" page heading', async () => {
		mockGetTopStats.mockResolvedValue([]);
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('Highlights');
	});

	it('renders an accordion group per stat panel heading', async () => {
		mockGetTopStats.mockResolvedValue([]);
		render(await Page());
		const groups = await screen.findAllByTestId('stats-accordion-group');
		expect(groups.map((g) => g.querySelector('h2')?.textContent)).toEqual([
			'Busiest sessions:',
			'Most varied sessions:',
			'Individual species:'
		]);
	});

	it('scopes every getTopStats call to the viewed group', async () => {
		mockGetTopStats.mockResolvedValue([]);
		render(await Page());
		await screen.findAllByTestId('stats-accordion-group');
		expect(mockGetTopStats.mock.calls.length).toBeGreaterThan(0);
		mockGetTopStats.mock.calls.forEach(([, args]) => {
			expect(args.filters.ringing_group_filter).toBe(1);
		});
	});

	describe('with no data for a stat', () => {
		it('still renders the panel, treating a null RPC result as empty', async () => {
			mockGetTopStats.mockResolvedValue(null);
			render(await Page());
			const groups = await screen.findAllByTestId('stats-accordion-group');
			expect(groups.length).toBe(3);
		});
	});
});
