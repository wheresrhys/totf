import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { TabContent } from '@/app/components/shared/TabContent';
import { SpYearTotalsTab } from '../SpYearTotalsTab';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import { getColumnIndex } from '@/app/__tests__/helpers/table';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

// `SpYearTotalsTab` is a pure presentational `TabConfig.TabComponent` (#1065)
// — fetching/loading/error state lives in `TabContent` (#1057), so these
// tests mount it through a real `TabContent`, exactly as `TabSet` does,
// rather than reaching into the component's own internals (it has none left).
const params: SpeciesTotalsTabParams = { speciesName: 'Robin' };
const viewedGroup = { id: 1, slug: 'alpha' };

function renderYearTotalsTab({
	initialData,
	dataFetcher = vi.fn()
}: {
	initialData?: CoreStatsResult[] | null;
	dataFetcher?: () => Promise<CoreStatsResult[]>;
}) {
	return render(
		<TabContent
			dataFetcher={dataFetcher}
			TabComponent={SpYearTotalsTab}
			params={params}
			viewedGroup={viewedGroup}
			{...(initialData === undefined ? {} : { initialData })}
		/>
	);
}

describe('SpYearTotalsTab', () => {
	afterEach(() => {
		cleanup();
	});

	describe('rendering with server-prefetched data', () => {
		it('renders the totals table immediately when `data` is supplied as a prop, with no loading spinner', () => {
			renderYearTotalsTab({
				initialData: [buildCoreStatsRow({ time_period: '2026-01-01' })]
			});
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
			expect(document.querySelector('.loading')).toBeNull();
		});

		it('renders the correct rows/columns for the supplied data', () => {
			renderYearTotalsTab({
				initialData: [
					buildCoreStatsRow({ time_period: '2025-01-01' }),
					buildCoreStatsRow({ time_period: '2026-01-01' })
				]
			});
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
			const link2025 = screen.getByRole('link', { name: '2025' });
			const link2026 = screen.getByRole('link', { name: '2026' });
			expect(link2025.getAttribute('href')).toBe('/species/Robin/2025');
			expect(link2026.getAttribute('href')).toBe('/species/Robin/2026');
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
			renderYearTotalsTab({ dataFetcher });
			expect(document.querySelector('.loading')).toBeTruthy();
			resolveData([]);
		});

		it('renders the totals table once the dataFetcher resolves', async () => {
			const dataFetcher = vi
				.fn()
				.mockResolvedValue([buildCoreStatsRow({ time_period: '2026-01-01' })]);
			renderYearTotalsTab({ dataFetcher });
			await waitFor(() => {
				expect(screen.getByTestId('period-totals-table')).toBeTruthy();
			});
			expect(dataFetcher).toHaveBeenCalledWith(params, viewedGroup);
			expect(screen.getByRole('link', { name: '2026' })).toBeTruthy();
		});

		it('shows the period table empty state when no years are returned', async () => {
			const dataFetcher = vi.fn().mockResolvedValue([]);
			renderYearTotalsTab({ dataFetcher });
			await waitFor(() => {
				expect(screen.getByText('No data recorded.')).toBeTruthy();
			});
		});
	});
});
