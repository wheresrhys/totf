import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SpHighlightsTab } from '../SpHighlightsTab';
import notableRetrapsSnapshot from '@/test-fixtures/snapshots/notable_retraps/robin-alpha.retraps.json';
import type { NotableRetrapsResult } from '@/app/models/db';

vi.mock('@/app/actions/sp-data', () => ({
	fetchNotableRetraps: vi.fn()
}));

vi.mock('@/app/lib/highlights', () => ({
	getHighlightsWithinTimeWindow: vi.fn()
}));

describe('SpHighlightsTab', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchNotableRetraps } = await import('@/app/actions/sp-data');
		const { getHighlightsWithinTimeWindow } =
			await import('@/app/lib/highlights');
		vi.mocked(fetchNotableRetraps).mockResolvedValue(
			notableRetrapsSnapshot as NotableRetrapsResult[]
		);
		vi.mocked(getHighlightsWithinTimeWindow).mockResolvedValue([]);
	});

	it('renders loading spinner before data loads', async () => {
		const { fetchNotableRetraps } = await import('@/app/actions/sp-data');
		let resolveData!: (v: NotableRetrapsResult[]) => void;
		vi.mocked(fetchNotableRetraps).mockReturnValue(
			new Promise((resolve) => {
				resolveData = resolve;
			})
		);
		render(
			<SpHighlightsTab
				speciesName="Robin"
				viewedGroup={{ id: 1, slug: 'gp' }}
			/>
		);
		expect(document.querySelector('.loading')).toBeDefined();
		resolveData(notableRetrapsSnapshot as NotableRetrapsResult[]);
	});

	it('renders notable retraps table after data loads', async () => {
		render(
			<SpHighlightsTab
				speciesName="Robin"
				viewedGroup={{ id: 1, slug: 'gp' }}
			/>
		);
		await waitFor(() => {
			expect(screen.getByRole('table')).toBeDefined();
		});
		const rows = document.querySelectorAll('tbody tr');
		expect(rows.length).toBe(notableRetrapsSnapshot.length);
	});

	it('shows empty state when no retraps found', async () => {
		const { fetchNotableRetraps } = await import('@/app/actions/sp-data');
		vi.mocked(fetchNotableRetraps).mockResolvedValue([]);
		render(
			<SpHighlightsTab
				speciesName="Robin"
				viewedGroup={{ id: 1, slug: 'gp' }}
			/>
		);
		await waitFor(() => {
			expect(screen.getByText('No notable retraps found')).toBeDefined();
		});
	});
});
