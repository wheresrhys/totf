import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	waitFor,
	fireEvent
} from '@testing-library/react';
import { TabContent } from '@/app/components/shared/TabContent';
import { SpMonthTotalsTab } from '../SpMonthTotalsTab';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import { getColumnIndex } from '@/app/__tests__/helpers/table';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

// `SpMonthTotalsTab` is a pure presentational `TabConfig.TabComponent` (#1065)
// — fetching/loading/error state lives in `TabContent` (#1057), so these
// tests mount it through a real `TabContent`, exactly as `TabSet` does.
const viewedGroup = { id: 1, slug: 'alpha' };

function renderMonthTotalsTab({
	params = { speciesName: 'Robin', year: 2026 },
	initialData,
	dataFetcher = vi.fn()
}: {
	params?: SpeciesTotalsTabParams;
	initialData?: CoreStatsResult[] | null;
	dataFetcher?: () => Promise<CoreStatsResult[]>;
}) {
	return render(
		<TabContent
			dataFetcher={dataFetcher}
			TabComponent={SpMonthTotalsTab}
			params={params}
			viewedGroup={viewedGroup}
			{...(initialData === undefined ? {} : { initialData })}
		/>
	);
}

describe('SpMonthTotalsTab', () => {
	afterEach(() => {
		cleanup();
	});

	describe('rendering with server-prefetched data', () => {
		it('renders the totals table immediately when `data` is supplied as a prop, with no loading spinner', () => {
			renderMonthTotalsTab({
				initialData: [buildCoreStatsRow({ time_period: '2026-03-01' })]
			});
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
			expect(document.querySelector('.loading')).toBeNull();
		});

		it('renders the correct rows/columns for the supplied data', () => {
			renderMonthTotalsTab({
				initialData: [buildCoreStatsRow({ time_period: '2026-03-01' })]
			});
			// Only March has sessions in the supplied data; the rest are
			// zero-filled and hidden by default.
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
			const marchLink = screen.getByRole('link', { name: 'March 2026' });
			expect(marchLink.getAttribute('href')).toBe('/species/Robin/2026/3');
			const encountersIndex = getColumnIndex('Encounters');
			const busiestSessionIndex = getColumnIndex('Busiest session');
			const birdsIndex = getColumnIndex('Birds');
			expect(busiestSessionIndex).toBe(encountersIndex + 1);
			expect(busiestSessionIndex).toBe(birdsIndex - 1);
		});
	});

	describe('rendering without prefetched data', () => {
		it('shows a loading state before data arrives', () => {
			let resolveData!: (v: CoreStatsResult[]) => void;
			const dataFetcher = vi.fn(
				() =>
					new Promise<CoreStatsResult[]>((resolve) => {
						resolveData = resolve;
					})
			);
			renderMonthTotalsTab({ dataFetcher });
			expect(document.querySelector('.loading')).toBeTruthy();
			resolveData([]);
		});

		it('renders the totals table once the dataFetcher resolves', async () => {
			const dataFetcher = vi
				.fn()
				.mockResolvedValue([buildCoreStatsRow({ time_period: '2026-03-01' })]);
			const params: SpeciesTotalsTabParams = {
				speciesName: 'Robin',
				year: 2026,
				fromDate: '2026-01-01',
				toDate: '2026-12-31'
			};
			renderMonthTotalsTab({ params, dataFetcher });
			await waitFor(() => {
				expect(screen.getByTestId('period-totals-table')).toBeTruthy();
			});
			expect(dataFetcher).toHaveBeenCalledWith(params, viewedGroup);
			expect(screen.getByRole('link', { name: 'March 2026' })).toBeTruthy();
		});
	});

	describe('empty months toggle', () => {
		it('renders only months with data by default (Hide)', () => {
			renderMonthTotalsTab({
				initialData: [buildCoreStatsRow({ time_period: '2026-03-01' })]
			});
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
			expect(
				(screen.getByRole('radio', { name: 'Hide' }) as HTMLInputElement)
					.checked
			).toBe(true);
			expect(screen.getByText('March 2026')).not.toBeNull();
		});

		it('shows all 12 months when toggled to Show', () => {
			renderMonthTotalsTab({
				initialData: [buildCoreStatsRow({ time_period: '2026-03-01' })]
			});
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
			expect(screen.getByText('January 2026')).not.toBeNull();
			expect(screen.queryByRole('link', { name: 'January 2026' })).toBeNull();
			expect(screen.getByText('December 2026')).not.toBeNull();
			expect(screen.queryByRole('link', { name: 'December 2026' })).toBeNull();
		});

		it('restores hidden months when toggled back to Hide', () => {
			renderMonthTotalsTab({
				initialData: [buildCoreStatsRow({ time_period: '2026-03-01' })]
			});
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
			fireEvent.click(screen.getByRole('radio', { name: 'Hide' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
		});

		it('has no visible effect for a year with no empty months', () => {
			renderMonthTotalsTab({
				initialData: Array.from({ length: 12 }, (_unused, index) =>
					buildCoreStatsRow({
						time_period: `2026-${String(index + 1).padStart(2, '0')}-01`,
						session_count: 2
					})
				)
			});
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
			fireEvent.click(screen.getByRole('radio', { name: 'Show' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
		});

		it('shows exactly one month for a year that is empty except one', () => {
			renderMonthTotalsTab({
				initialData: [
					buildCoreStatsRow({ time_period: '2026-08-01', session_count: 3 })
				]
			});
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
			expect(screen.getByText('August 2026')).not.toBeNull();
		});
	});
});
