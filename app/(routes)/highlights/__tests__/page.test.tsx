import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';

describe('/highlights (all-time)', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders the "All time highlights" heading', async () => {
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('All time highlights');
	});
});
