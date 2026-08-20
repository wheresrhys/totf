import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HighlightsHeading } from '../_shared';

describe('HighlightsHeading', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders "All time highlights" when neither year nor month is given', async () => {
		render(<HighlightsHeading />);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('All time highlights');
	});

	it('renders "{year} highlights" when only year is given', async () => {
		render(<HighlightsHeading year={2026} />);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('2026 highlights');
	});

	it('renders "{long month} {year} highlights" when both year and month are given', async () => {
		render(<HighlightsHeading year={2026} month={8} />);
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('August 2026 highlights');
	});
});
