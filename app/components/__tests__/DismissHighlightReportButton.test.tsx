import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	fireEvent,
	waitFor,
	cleanup
} from '@testing-library/react';

const { mockDismissHighlightReport, mockRefresh } = vi.hoisted(() => {
	const mockDismissHighlightReport = vi.fn();
	const mockRefresh = vi.fn();
	return { mockDismissHighlightReport, mockRefresh };
});

vi.mock('next/navigation', () => ({
	useRouter: () => ({ refresh: mockRefresh })
}));

vi.mock('@/app/actions/highlight-reports', () => ({
	dismissHighlightReport: mockDismissHighlightReport
}));

import { DismissHighlightReportButton } from '../DismissHighlightReportButton';

describe('DismissHighlightReportButton', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('submits the report id to the dismiss action', async () => {
		mockDismissHighlightReport.mockResolvedValue({ success: true });
		render(<DismissHighlightReportButton reportId={42} />);

		fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

		await waitFor(() => expect(mockDismissHighlightReport).toHaveBeenCalled());
		const formData = mockDismissHighlightReport.mock.calls[0][1] as FormData;
		expect(formData.get('reportId')).toBe('42');
	});

	it('disables the button and shows a spinner while pending', async () => {
		let resolveAction!: (state: { success: true }) => void;
		mockDismissHighlightReport.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveAction = resolve;
				})
		);
		render(<DismissHighlightReportButton reportId={42} />);
		// Captured before submit — once pending, the button's accessible name
		// changes from "Dismiss" to the spinner, so it can no longer be found by
		// name.
		const dismissButton = screen.getByRole('button', { name: 'Dismiss' });

		fireEvent.click(dismissButton);

		await waitFor(() => expect(dismissButton).toHaveProperty('disabled', true));
		resolveAction({ success: true });
	});

	it('shows an inline error and does not refresh when the action fails', async () => {
		mockDismissHighlightReport.mockResolvedValue({
			success: false,
			error: 'Failed to dismiss report'
		});
		render(<DismissHighlightReportButton reportId={42} />);

		fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

		expect(await screen.findByText('Failed to dismiss report')).toBeDefined();
		expect(mockRefresh).not.toHaveBeenCalled();
	});

	it('calls router.refresh() on success', async () => {
		mockDismissHighlightReport.mockResolvedValue({ success: true });
		render(<DismissHighlightReportButton reportId={42} />);

		fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

		await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
	});
});
