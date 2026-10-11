import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockCanReportHighlights, mockNotFound, mockFrom } = vi.hoisted(() => {
	const mockCanReportHighlights = vi.fn();
	const mockNotFound = vi.fn();
	const mockFrom = vi.fn();
	return { mockCanReportHighlights, mockNotFound, mockFrom };
});

// Local override of the global next/navigation mock (vitest.setup.tsx) — this
// page needs notFound(), which the global mock doesn't provide.
vi.mock('next/navigation', () => ({
	notFound: mockNotFound
}));

vi.mock('@/app/lib/qa-reporting', () => ({
	canReportHighlights: mockCanReportHighlights
}));

vi.mock('@/lib/supabase', () => ({
	supabase: { from: mockFrom },
	catchSupabaseErrors: ({
		data,
		error
	}: {
		data: unknown;
		error: { message: string } | null;
	}) => {
		if (error) throw new Error(`Failed to fetch data: ${error.message}`);
		return data ?? null;
	}
}));

import HighlightReportsAdminPage from '../page';

const REPORT_ROWS = [
	{
		id: 2,
		created_at: '2026-02-01T00:00:00Z',
		page_url: 'https://example.test/summary',
		highlight_text: 'Second Robin ever',
		reason: 'Looks wrong',
		highlight_body: { descriptor: { type: 'test-2' } }
	},
	{
		id: 1,
		created_at: '2026-01-01T00:00:00Z',
		page_url: 'https://example.test/session/2026-01-01',
		highlight_text: 'First Robin ever',
		reason: 'Species mis-identified',
		highlight_body: { descriptor: { type: 'test-1' } }
	}
];

function mockSelectChain(rows: typeof REPORT_ROWS) {
	const chain: Record<string, unknown> = {
		select: vi.fn(() => chain),
		order: vi.fn(() => chain),
		then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
			Promise.resolve({ data: rows, error: null }).then(resolve)
	};
	mockFrom.mockReturnValue(chain);
	return chain;
}

describe('HighlightReportsAdminPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders a 404 when canReportHighlights is false', async () => {
		mockCanReportHighlights.mockResolvedValue(false);
		mockSelectChain([]);

		await HighlightReportsAdminPage();

		expect(mockNotFound).toHaveBeenCalled();
	});

	it('renders every HighlightReports row, most recent first, when canReportHighlights is true', async () => {
		mockCanReportHighlights.mockResolvedValue(true);
		const chain = mockSelectChain(REPORT_ROWS);

		const page = await HighlightReportsAdminPage();
		render(page);

		expect(mockFrom).toHaveBeenCalledWith('HighlightReports');
		expect(chain.order).toHaveBeenCalledWith('created_at', {
			ascending: false
		});
		expect(screen.getByText('Second Robin ever')).toBeDefined();
		expect(screen.getByText('First Robin ever')).toBeDefined();
		expect(mockNotFound).not.toHaveBeenCalled();
	});
});
