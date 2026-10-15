import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCanReportHighlights, mockNotFound } = vi.hoisted(() => ({
	mockCanReportHighlights: vi.fn(),
	mockNotFound: vi.fn()
}));

// Local override of the global next/navigation mock (vitest.setup.tsx) —
// this page needs notFound(), which the global mock doesn't provide.
vi.mock('next/navigation', () => ({
	notFound: mockNotFound
}));

vi.mock('@/app/lib/qa-reporting', () => ({
	canReportHighlights: mockCanReportHighlights
}));

import HighlightsReviewPage from '../page';

describe('HighlightsReviewPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('calls notFound when canReportHighlights is false', async () => {
		mockCanReportHighlights.mockResolvedValue(false);

		await HighlightsReviewPage({});

		expect(mockNotFound).toHaveBeenCalled();
	});

	it('does not call notFound when canReportHighlights is true', async () => {
		mockCanReportHighlights.mockResolvedValue(true);

		await HighlightsReviewPage({});

		expect(mockNotFound).not.toHaveBeenCalled();
	});
});
