import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor,
	within,
	act
} from '@testing-library/react';
import {
	getCellByHeading,
	getCellTextByHeading
} from '@/app/__tests__/helpers/table';
import { StatsConsistencyPageContent } from '../PageContent';
import { regenerateStatsCache } from '@/app/actions/regenerate-stats-cache';
import type { OwnGroupImportJobRow } from '@/app/actions/import-jobs';

vi.mock('@/app/actions/regenerate-stats-cache', () => ({
	regenerateStatsCache: vi.fn()
}));

function buildImportJob(
	overrides: Partial<OwnGroupImportJobRow> = {}
): OwnGroupImportJobRow {
	return {
		id: 1,
		status: 'succeeded',
		started_at: '2026-01-01T09:30:00Z',
		finished_at: '2026-01-01T09:35:00Z',
		rows_processed: 10,
		rows_successful: 10,
		rows_failed: 0,
		day_stats_refresh_status: 'succeeded',
		month_stats_refresh_status: 'succeeded',
		year_stats_refresh_status: 'succeeded',
		month_squashed_stats_refresh_status: 'succeeded',
		all_time_stats_refresh_status: 'succeeded',
		...overrides
	};
}

describe('StatsConsistencyPageContent', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	describe('rendering the import jobs list', () => {
		it('renders one row per import job, in the given order', () => {
			const importJobs = [
				buildImportJob({ id: 1, status: 'succeeded' }),
				buildImportJob({ id: 2, status: 'failed' })
			];
			render(<StatsConsistencyPageContent data={{ importJobs }} />);

			expect(getCellTextByHeading('Status', 0)).toBe('succeeded');
			expect(getCellTextByHeading('Status', 1)).toBe('failed');
		});

		it('shows an empty-state message, not an empty table, when there are no import jobs', () => {
			render(<StatsConsistencyPageContent data={{ importJobs: [] }} />);

			expect(screen.queryByRole('table')).toBeNull();
			expect(screen.getByText('No import jobs yet.').textContent).toBe(
				'No import jobs yet.'
			);
		});
	});

	describe('per-temporal-unit refresh status', () => {
		it('shows status only, with no retrigger button, for a refresh column already succeeded', () => {
			const importJobs = [
				buildImportJob({ day_stats_refresh_status: 'succeeded' })
			];
			render(<StatsConsistencyPageContent data={{ importJobs }} />);

			const cell = getCellByHeading('day', 0);
			expect(within(cell).queryByRole('button')).toBeNull();
			expect(cell.textContent).toBe('succeeded');
		});

		it('shows a retrigger button for a refresh column that failed', () => {
			const importJobs = [
				buildImportJob({ day_stats_refresh_status: 'failed' })
			];
			render(<StatsConsistencyPageContent data={{ importJobs }} />);

			const cell = getCellByHeading('day', 0);
			expect(
				within(cell).getByRole('button', { name: 'Retrigger' }).textContent
			).toBe('Retrigger');
		});

		it('shows a retrigger button for a refresh column stuck in_progress', () => {
			const importJobs = [
				buildImportJob({ month_stats_refresh_status: 'in_progress' })
			];
			render(<StatsConsistencyPageContent data={{ importJobs }} />);

			const cell = getCellByHeading('month', 0);
			expect(
				within(cell).getByRole('button', { name: 'Retrigger' }).textContent
			).toBe('Retrigger');
		});

		it('shows a retrigger button for a refresh column that timed out', () => {
			const importJobs = [
				buildImportJob({ year_stats_refresh_status: 'timed_out' })
			];
			render(<StatsConsistencyPageContent data={{ importJobs }} />);

			const cell = getCellByHeading('year', 0);
			expect(
				within(cell).getByRole('button', { name: 'Retrigger' }).textContent
			).toBe('Retrigger');
		});
	});

	describe('retriggering a failed refresh', () => {
		it("calls regenerateStatsCache with the clicked column's matching temporalUnit and no periods/speciesIds", async () => {
			vi.mocked(regenerateStatsCache).mockResolvedValue({ success: true });
			const importJobs = [
				buildImportJob({ month_stats_refresh_status: 'failed' })
			];
			render(<StatsConsistencyPageContent data={{ importJobs }} />);

			const cell = getCellByHeading('month', 0);
			fireEvent.click(within(cell).getByRole('button', { name: 'Retrigger' }));

			await waitFor(() => {
				expect(regenerateStatsCache).toHaveBeenCalledWith({
					temporalUnit: 'month'
				});
			});
		});

		it('disables the clicked button and shows a pending state while the call is in flight', async () => {
			let resolveRegenerate!: (result: { success: true }) => void;
			vi.mocked(regenerateStatsCache).mockReturnValue(
				new Promise((resolve) => {
					resolveRegenerate = resolve;
				})
			);
			const importJobs = [
				buildImportJob({ day_stats_refresh_status: 'failed' })
			];
			render(<StatsConsistencyPageContent data={{ importJobs }} />);
			const cell = getCellByHeading('day', 0);
			const button = within(cell).getByRole('button') as HTMLButtonElement;

			fireEvent.click(button);

			await waitFor(() => {
				expect(button.disabled).toBe(true);
			});
			expect(button.textContent).toBe('Retriggering…');

			await act(async () => {
				resolveRegenerate({ success: true });
			});
		});

		it('keeps the button disabled and shows a retriggered message once the call succeeds', async () => {
			vi.mocked(regenerateStatsCache).mockResolvedValue({ success: true });
			const importJobs = [
				buildImportJob({ day_stats_refresh_status: 'failed' })
			];
			render(<StatsConsistencyPageContent data={{ importJobs }} />);
			const cell = getCellByHeading('day', 0);
			const button = within(cell).getByRole('button') as HTMLButtonElement;

			fireEvent.click(button);

			await waitFor(() => {
				expect(screen.getByText('Retriggered').textContent).toBe('Retriggered');
			});
			expect(
				(within(cell).getByRole('button') as HTMLButtonElement).disabled
			).toBe(true);
		});

		it('re-enables the button and shows the returned error inline if the call fails', async () => {
			vi.mocked(regenerateStatsCache).mockResolvedValue({
				success: false,
				error: 'Refresh failed'
			});
			const importJobs = [
				buildImportJob({ day_stats_refresh_status: 'failed' })
			];
			render(<StatsConsistencyPageContent data={{ importJobs }} />);
			const cell = getCellByHeading('day', 0);
			const button = within(cell).getByRole('button') as HTMLButtonElement;

			fireEvent.click(button);

			const alert = await within(cell).findByRole('alert');
			expect(alert.textContent).toBe('Refresh failed');
			expect(
				(within(cell).getByRole('button') as HTMLButtonElement).disabled
			).toBe(false);
		});

		it("leaves every other row/column's pending and disabled state unaffected by one retrigger click", async () => {
			let resolveRegenerate!: (result: { success: true }) => void;
			vi.mocked(regenerateStatsCache).mockReturnValue(
				new Promise((resolve) => {
					resolveRegenerate = resolve;
				})
			);
			const importJobs = [
				buildImportJob({
					id: 1,
					day_stats_refresh_status: 'failed',
					month_stats_refresh_status: 'failed'
				}),
				buildImportJob({ id: 2, day_stats_refresh_status: 'failed' })
			];
			render(<StatsConsistencyPageContent data={{ importJobs }} />);

			const dayCellRow0 = getCellByHeading('day', 0);
			const monthCellRow0 = getCellByHeading('month', 0);
			const dayCellRow1 = getCellByHeading('day', 1);

			fireEvent.click(
				within(dayCellRow0).getByRole('button') as HTMLButtonElement
			);

			await waitFor(() => {
				expect(
					(within(dayCellRow0).getByRole('button') as HTMLButtonElement)
						.disabled
				).toBe(true);
			});
			expect(
				(within(monthCellRow0).getByRole('button') as HTMLButtonElement)
					.disabled
			).toBe(false);
			expect(
				(within(dayCellRow1).getByRole('button') as HTMLButtonElement).disabled
			).toBe(false);

			await act(async () => {
				resolveRegenerate({ success: true });
			});
		});
	});
});
