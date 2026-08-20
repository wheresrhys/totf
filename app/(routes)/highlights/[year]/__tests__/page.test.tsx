import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';

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
});
