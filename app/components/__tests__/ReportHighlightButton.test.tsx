import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ReportHighlightButton } from '../ReportHighlightButton';
import type { CombinedHighlight } from '@/modules/highlights/types';

// ReportHighlightButton renders ReportHighlightModal, which imports the
// server action; mock it so importing the tree doesn't pull the real action.
vi.mock('@/app/actions/highlight-reports', () => ({
	reportHighlight: vi.fn()
}));

const highlight = {
	formatters: {
		combinedHighlightPrinter: () => 'A highlight',
		highlightListPrefixPrinter: () => ''
	},
	descriptor: { category: 'rarity', type: 'test', unit: 'encounter' },
	value: { timePeriod: 'all-time', value: 1, species: null },
	species: undefined,
	bestPosition: 1,
	scopes: []
} as CombinedHighlight;

describe('ReportHighlightButton', () => {
	afterEach(() => {
		cleanup();
	});

	it('shows nothing extra until clicked', () => {
		render(
			<ReportHighlightButton
				highlight={highlight}
				displayedText="A highlight"
			/>
		);
		expect(screen.queryByTestId('report-highlight-modal')).toBeNull();
	});

	it('opens the report modal when clicked', () => {
		render(
			<ReportHighlightButton
				highlight={highlight}
				displayedText="A highlight"
			/>
		);
		fireEvent.click(screen.getByRole('button', { name: 'Report' }));
		expect(screen.getByTestId('report-highlight-modal')).toBeDefined();
	});

	it('closes the modal when it reports close', () => {
		render(
			<ReportHighlightButton
				highlight={highlight}
				displayedText="A highlight"
			/>
		);
		fireEvent.click(screen.getByRole('button', { name: 'Report' }));
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByTestId('report-highlight-modal')).toBeNull();
	});
});
