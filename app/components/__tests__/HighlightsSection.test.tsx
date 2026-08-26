import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HighlightsSection } from '../HighlightsSection';

afterEach(() => {
	cleanup();
});

describe('HighlightsSection', () => {
	describe('Usual', () => {
		it('renders a heading with the text "Highlights"', () => {
			render(<HighlightsSection />);
			const heading = screen.getByRole('heading', { name: 'Highlights' });
			expect(heading.textContent).toBe('Highlights');
		});
	});
});
