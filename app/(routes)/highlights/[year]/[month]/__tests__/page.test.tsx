import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';

describe('/highlights/[year]/[month]', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders "{long month} {year} highlights" for a well-formed year/month', async () => {
		render(
			await Page({
				params: Promise.resolve({ year: '2026', month: '08' })
			})
		);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('August 2026 highlights');
	});

	it('404s for an out-of-range month', async () => {
		render(
			await Page({
				params: Promise.resolve({ year: '2026', month: '13' })
			})
		);
		expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
		await screen.findByText('No data available');
	});

	it('404s for an unpadded month', async () => {
		render(
			await Page({
				params: Promise.resolve({ year: '2026', month: '8' })
			})
		);
		expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
		await screen.findByText('No data available');
	});
});
