import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HighlightReportBody } from '../HighlightReportBody';

const HIGHLIGHT_BODY = { descriptor: { type: 'test' }, value: 42 };

describe('HighlightReportBody', () => {
	afterEach(() => {
		cleanup();
	});

	it('hides the highlight body by default, showing a "Show config" button', () => {
		render(<HighlightReportBody highlightBody={HIGHLIGHT_BODY} />);

		expect(screen.getByRole('button', { name: 'Show config' })).toBeDefined();
		expect(screen.queryByText(/"type": "test"/)).toBeNull();
	});

	it('reveals the JSON body and flips the button to "Hide config" on click', () => {
		render(<HighlightReportBody highlightBody={HIGHLIGHT_BODY} />);

		fireEvent.click(screen.getByRole('button', { name: 'Show config' }));

		expect(screen.getByRole('button', { name: 'Hide config' })).toBeDefined();
		expect(screen.getByText(/"type": "test"/)).toBeDefined();
	});

	it('hides the body again on a second click', () => {
		render(<HighlightReportBody highlightBody={HIGHLIGHT_BODY} />);

		fireEvent.click(screen.getByRole('button', { name: 'Show config' }));
		fireEvent.click(screen.getByRole('button', { name: 'Hide config' }));

		expect(screen.getByRole('button', { name: 'Show config' })).toBeDefined();
		expect(screen.queryByText(/"type": "test"/)).toBeNull();
	});
});
