import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';

vi.mock('@/lib/underlying-stats', () => ({
	fetchSessionStats: vi.fn().mockResolvedValue({
		daySpeciesStats: [],
		sessionDates: ['2025-04-01', '2026-01-05', '2026-06-30']
	})
}));

describe('/highlights/[year]', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders "{year} highlights" for a well-formed year', async () => {
		render(await Page({ params: Promise.resolve({ year: '2026' }) }));
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('2026 highlights');
	});

	it('renders the heading even with zero sessions that year (no DB check)', async () => {
		render(await Page({ params: Promise.resolve({ year: '1901' }) }));
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('1901 highlights');
	});

	it('renders only links for dates within the given year', async () => {
		render(
			await Page({
				params: Promise.resolve({
					year: '2026',
					viewedGroup: { id: 1, slug: 'alpha' }
				})
			})
		);
		await screen.findByRole('heading', { level: 1 });
		const links = screen.getAllByRole('link');
		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			'/group/alpha/session-temp/2026-01-05',
			'/group/alpha/session-temp/2026-06-30'
		]);
	});
});
