import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SpNotableRetrapsTab } from '../SpNotableRetrapsTab';
import notableRetrapsSnapshot from '@/test-fixtures/snapshots/fetchSpNotableRetraps.alpha.robin.json';
import type { NotableRetrapsResult } from '@/app/models/db';

vi.mock('@/app/actions/sp-data', () => ({
	fetchNotableRetraps: vi.fn()
}));

describe('SpNotableRetrapsTab', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchNotableRetraps } = await import('@/app/actions/sp-data');
		vi.mocked(fetchNotableRetraps).mockResolvedValue(
			notableRetrapsSnapshot as NotableRetrapsResult[]
		);
	});

	it('renders loading spinner before data loads', async () => {
		const { fetchNotableRetraps } = await import('@/app/actions/sp-data');
		let resolveData!: (v: NotableRetrapsResult[]) => void;
		vi.mocked(fetchNotableRetraps).mockReturnValue(
			new Promise((resolve) => {
				resolveData = resolve;
			})
		);
		render(<SpNotableRetrapsTab speciesName="Robin" viewedGroupId={1} />);
		expect(document.querySelector('.loading')).toBeDefined();
		resolveData(notableRetrapsSnapshot as NotableRetrapsResult[]);
	});

	it('renders notable retraps table after data loads', async () => {
		render(<SpNotableRetrapsTab speciesName="Robin" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByRole('table')).toBeDefined();
		});
		const rows = document.querySelectorAll('tbody tr');
		expect(rows.length).toBe(notableRetrapsSnapshot.length);
	});

	it('shows empty state when no retraps found', async () => {
		const { fetchNotableRetraps } = await import('@/app/actions/sp-data');
		vi.mocked(fetchNotableRetraps).mockResolvedValue([]);
		render(<SpNotableRetrapsTab speciesName="Robin" viewedGroupId={1} />);
		await waitFor(() => {
			expect(screen.getByText('No notable retraps found')).toBeDefined();
		});
	});
});
