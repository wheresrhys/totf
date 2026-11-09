import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import { fetchOwnGroupImportJobs } from '@/app/actions/import-jobs';
import { getCellTextByHeading } from '@/app/__tests__/helpers/table';
import type { OwnGroupImportJobRow } from '@/app/actions/import-jobs';

vi.mock('@/app/actions/import-jobs', () => ({
	fetchOwnGroupImportJobs: vi.fn()
}));

describe('stats consistency page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders heading', async () => {
		vi.mocked(fetchOwnGroupImportJobs).mockResolvedValue([]);
		render(await Page());
		const heading = await screen.findByRole('heading', { level: 1 });
		expect(heading.textContent).toBe('Stats consistency');
	});

	it('passes the import jobs fetchOwnGroupImportJobs resolves with through to the page content', async () => {
		const importJobs: OwnGroupImportJobRow[] = [
			{
				id: 1,
				status: 'failed',
				started_at: '2026-01-01T09:30:00Z',
				finished_at: '2026-01-01T09:35:00Z',
				rows_processed: 10,
				rows_successful: 8,
				rows_failed: 2,
				day_stats_refresh_status: 'succeeded',
				month_stats_refresh_status: 'succeeded',
				year_stats_refresh_status: 'succeeded',
				month_squashed_stats_refresh_status: 'succeeded',
				all_time_stats_refresh_status: 'succeeded'
			}
		];
		vi.mocked(fetchOwnGroupImportJobs).mockResolvedValue(importJobs);

		render(await Page());

		await screen.findByRole('table');
		expect(getCellTextByHeading('Status', 0)).toBe('failed');
	});
});
