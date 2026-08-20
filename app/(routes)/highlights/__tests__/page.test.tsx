import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';

vi.mock('@/lib/underlying-stats', () => ({
	fetchSessionStats: vi.fn().mockResolvedValue({
		daySpeciesStats: [],
		sessionDates: ['2025-04-01', '2026-01-05']
	})
}));

describe('/highlights (all-time)', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders the "All time highlights" heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('All time highlights');
	});

	it('renders a session link for every date returned by fetchSessionStats', async () => {
		render(await Page());
		await screen.findByRole('heading', { level: 1 });
		expect(screen.getAllByRole('link')).toHaveLength(2);
	});
});
