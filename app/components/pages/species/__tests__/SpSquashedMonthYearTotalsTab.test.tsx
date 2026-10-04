import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { TabContent } from '@/app/components/shared/TabContent';
import { SpSquashedMonthYearTotalsTab } from '../SpSquashedMonthYearTotalsTab';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

// `SpSquashedMonthYearTotalsTab` is a pure presentational
// `TabConfig.TabComponent` (#1066) — fetching/loading/error state lives in
// `TabContent` (#1057), so these tests mount it through a real `TabContent`,
// exactly as `TabSet` does.
const viewedGroup = { id: 1, slug: 'alpha' };

function renderTab({
	params = { speciesName: 'Robin', monthFilter: 1 },
	initialData,
	dataFetcher = vi.fn()
}: {
	params?: SpeciesTotalsTabParams;
	initialData?: CoreStatsResult[] | null;
	dataFetcher?: () => Promise<CoreStatsResult[]>;
} = {}) {
	return render(
		<TabContent
			dataFetcher={dataFetcher}
			TabComponent={SpSquashedMonthYearTotalsTab}
			params={params}
			viewedGroup={viewedGroup}
			{...(initialData === undefined ? {} : { initialData })}
		/>
	);
}

describe('SpSquashedMonthYearTotalsTab', () => {
	afterEach(() => {
		cleanup();
	});

	describe('rendering with server-prefetched data', () => {
		it('renders the totals table immediately when `data` is supplied as a prop, with no loading spinner', () => {
			renderTab({
				initialData: [
					buildCoreStatsRow({ time_period: '2024-01-01' }),
					buildCoreStatsRow({ time_period: '2025-01-01' })
				]
			});
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
			expect(document.querySelector('.loading')).toBeNull();
		});

		it('labels each row "{month name} {year}" and links to /species/{name}/{year}/{month}', () => {
			renderTab({
				initialData: [
					buildCoreStatsRow({ time_period: '2024-01-01' }),
					buildCoreStatsRow({ time_period: '2025-01-01' })
				]
			});
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
			const link2024 = screen.getByRole('link', { name: 'January 2024' });
			expect(link2024.getAttribute('href')).toBe('/species/Robin/2024/1');
			const link2025 = screen.getByRole('link', { name: 'January 2025' });
			expect(link2025.getAttribute('href')).toBe('/species/Robin/2025/1');
		});

		it('uses the requested squashed month (monthFilter) for every row regardless of its own bucket month', () => {
			renderTab({
				params: { speciesName: 'Robin', monthFilter: 12 },
				initialData: [buildCoreStatsRow({ time_period: '2024-12-01' })]
			});
			expect(screen.getByText('December 2024')).toBeTruthy();
			expect(
				screen.getByRole('link', { name: 'December 2024' }).getAttribute('href')
			).toBe('/species/Robin/2024/12');
		});

		it("renders the table's empty state when the species has no data for that month, without crashing", () => {
			renderTab({ initialData: [] });
			expect(screen.getByText('No data recorded.')).toBeTruthy();
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
			renderTab({ dataFetcher });
			expect(document.querySelector('.loading')).toBeTruthy();
			resolveData([]);
		});

		it('fetches year-grouped totals via dataFetcher, scoped to the shared params', async () => {
			const params: SpeciesTotalsTabParams = {
				speciesName: 'Robin',
				monthFilter: 1
			};
			const dataFetcher = vi
				.fn()
				.mockResolvedValue([buildCoreStatsRow({ time_period: '2024-01-01' })]);
			renderTab({ params, dataFetcher });
			await waitFor(() => {
				expect(screen.getByTestId('period-totals-table')).toBeTruthy();
			});
			expect(dataFetcher).toHaveBeenCalledWith(params, viewedGroup);
		});
	});
});
