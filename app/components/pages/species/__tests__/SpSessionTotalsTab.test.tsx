import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { TabContent } from '@/app/components/shared/TabContent';
import { SpSessionTotalsTab } from '../SpSessionTotalsTab';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import { buildDailyStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';

// `SpSessionTotalsTab` is a pure presentational `TabConfig.TabComponent`
// (#1065) — fetching/loading/error state lives in `TabContent` (#1057), so
// these tests mount it through a real `TabContent`, exactly as `TabSet` does.
const viewedGroup = { id: 1, slug: 'alpha' };

function renderSessionTotalsTab({
	params = { speciesName: 'Robin' },
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
			TabComponent={SpSessionTotalsTab}
			params={params}
			viewedGroup={viewedGroup}
			{...(initialData === undefined ? {} : { initialData })}
		/>
	);
}

describe('SpSessionTotalsTab', () => {
	afterEach(() => {
		cleanup();
	});

	describe('rendering with server-prefetched data', () => {
		it('renders the totals table immediately when `data` is supplied as a prop, with no loading spinner', () => {
			renderSessionTotalsTab({
				initialData: [buildDailyStatsRow({ time_period: '2026-03-14' })]
			});
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
			expect(document.querySelector('.loading')).toBeNull();
		});

		it('renders the correct rows/columns for the supplied data', () => {
			renderSessionTotalsTab({
				initialData: [
					buildDailyStatsRow({ time_period: '2026-03-14' }),
					buildDailyStatsRow({ time_period: '2026-03-21' })
				]
			});
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
			const march14Link = screen.getByRole('link', { name: '14th March 2026' });
			const march21Link = screen.getByRole('link', { name: '21st March 2026' });
			expect(march14Link.getAttribute('href')).toBe(
				'/group/alpha/session/2026-03-14'
			);
			expect(march21Link.getAttribute('href')).toBe(
				'/group/alpha/session/2026-03-21'
			);
			expect(
				screen.queryByRole('columnheader', { name: 'Busiest session' })
			).toBeNull();
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
			renderSessionTotalsTab({ dataFetcher });
			expect(document.querySelector('.loading')).toBeTruthy();
			resolveData([]);
		});

		it('renders the totals table once the dataFetcher resolves', async () => {
			const dataFetcher = vi
				.fn()
				.mockResolvedValue([buildDailyStatsRow({ time_period: '2026-03-14' })]);
			const params: SpeciesTotalsTabParams = {
				speciesName: 'Robin',
				fromDate: '2026-01-01',
				toDate: '2026-12-31'
			};
			renderSessionTotalsTab({ params, dataFetcher });
			await waitFor(() => {
				expect(screen.getByTestId('period-totals-table')).toBeTruthy();
			});
			expect(dataFetcher).toHaveBeenCalledWith(params, viewedGroup);
			expect(
				screen.getByRole('link', { name: '14th March 2026' })
			).toBeTruthy();
		});

		it("renders the table's empty state when the species has no sessions in range, without crashing", async () => {
			const dataFetcher = vi.fn().mockResolvedValue([]);
			renderSessionTotalsTab({ dataFetcher });
			await waitFor(() => {
				expect(screen.getByText('No data recorded.')).toBeTruthy();
			});
		});
	});
});
