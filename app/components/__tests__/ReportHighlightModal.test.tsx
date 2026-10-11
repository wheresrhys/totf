import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor
} from '@testing-library/react';
import { ReportHighlightModal } from '../ReportHighlightModal';
import type { ReportHighlightState } from '@/app/actions/highlight-reports';
import type { CombinedHighlight } from '@/app/lib/highlights/types';

const { mockReportHighlight } = vi.hoisted(() => ({
	mockReportHighlight: vi.fn()
}));

vi.mock('@/app/actions/highlight-reports', () => ({
	reportHighlight: mockReportHighlight
}));

const highlight = {
	formatters: {
		combinedHighlightPrinter: () => 'First Robin ever',
		highlightListPrefixPrinter: () => ''
	},
	descriptor: { category: 'rarity', type: 'test', unit: 'encounter' },
	value: { timePeriod: 'all-time', value: 1, species: null },
	species: undefined,
	bestPosition: 1,
	scopes: []
} as CombinedHighlight;

function renderReportHighlightModal(onClose = vi.fn()) {
	const renderResult = render(
		<ReportHighlightModal
			highlight={highlight}
			displayedText="First Robin ever"
			onClose={onClose}
		/>
	);
	return { ...renderResult, onClose };
}

function fillReasonAndSubmit(reason: string) {
	fireEvent.change(screen.getByPlaceholderText(/what's wrong/i), {
		target: { value: reason }
	});
	fireEvent.submit(
		screen.getByRole('button', { name: 'Confirm' }).closest('form')!
	);
}

describe('ReportHighlightModal', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	describe('submitting a report', () => {
		it('submits the page url, displayed highlight text, reason and highlight body JSON', async () => {
			mockReportHighlight.mockImplementation(
				async (): Promise<ReportHighlightState> => ({ success: true })
			);
			renderReportHighlightModal();

			fillReasonAndSubmit('Looks wrong');

			await waitFor(() => {
				expect(mockReportHighlight).toHaveBeenCalled();
			});
			const formData = mockReportHighlight.mock.calls[0][1] as FormData;
			expect(formData.get('highlightText')).toBe('First Robin ever');
			expect(formData.get('reason')).toBe('Looks wrong');
			// `formatters`' own properties are all functions, which JSON.stringify
			// drops individually — the key survives, just emptied out.
			expect(JSON.parse(formData.get('highlightBody') as string)).toEqual({
				...highlight,
				formatters: {}
			});
			expect(typeof formData.get('pageUrl')).toBe('string');
		});

		it('disables the confirm button and shows a spinner while pending', async () => {
			let resolveAction!: (state: ReportHighlightState) => void;
			mockReportHighlight.mockImplementation(
				() =>
					new Promise<ReportHighlightState>((resolve) => {
						resolveAction = resolve;
					})
			);
			renderReportHighlightModal();
			// Captured before submit — once pending, the button's accessible name
			// changes from "Confirm" to the spinner, so it can no longer be found
			// by name.
			const confirmButton = screen.getByRole('button', { name: 'Confirm' });

			fillReasonAndSubmit('Looks wrong');

			await waitFor(() => {
				expect(confirmButton).toHaveProperty('disabled', true);
			});
			resolveAction({ success: true });
		});

		it('closes the modal on success', async () => {
			mockReportHighlight.mockImplementation(
				async (): Promise<ReportHighlightState> => ({ success: true })
			);
			const { onClose } = renderReportHighlightModal();

			fillReasonAndSubmit('Looks wrong');

			await waitFor(() => {
				expect(onClose).toHaveBeenCalled();
			});
		});

		it('shows an inline error and stays open on failure', async () => {
			mockReportHighlight.mockImplementation(
				async (): Promise<ReportHighlightState> => ({
					success: false,
					error: 'Failed to submit report'
				})
			);
			const { onClose } = renderReportHighlightModal();

			fillReasonAndSubmit('Looks wrong');

			await waitFor(() => {
				expect(screen.getByText('Failed to submit report')).toBeDefined();
			});
			expect(onClose).not.toHaveBeenCalled();
			expect(screen.getByTestId('report-highlight-modal')).toBeDefined();
		});
	});

	describe('cancelling', () => {
		it('calls onClose without submitting', () => {
			const { onClose } = renderReportHighlightModal();

			fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

			expect(onClose).toHaveBeenCalled();
			expect(mockReportHighlight).not.toHaveBeenCalled();
		});
	});
});
