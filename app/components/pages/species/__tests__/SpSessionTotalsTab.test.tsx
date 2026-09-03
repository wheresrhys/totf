import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SpSessionTotalsTab } from '../SpSessionTotalsTab';
import type { AggregateStatsResult } from '@/app/models/db';

vi.mock('@/app/actions/sp-data', () => ({
	fetchSpeciesPeriodTotals: vi.fn()
}));

const viewedGroup = { id: 1, slug: 'alpha' };

function buildDailyStat(
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
	return {
		species_name: null,
		time_period: '2026-03-14',
		session_count: 1,
		total_effort: '03:00:00',
		effort_per_session: '03:00:00',
		effort_per_encounter: '00:15:00',
		avg_encounters_per_session: 12,
		max_per_session: 12,
		species_count: 1,
		bird_count: 10,
		encounter_count: 12,
		new_bird_count: 8,
		max_new_per_session: 8,
		max_weight: 13.1,
		avg_weight: 11.2,
		min_weight: 9.8,
		median_weight: 10.8,
		max_wing: 68,
		avg_wing: 66.6,
		min_wing: 65,
		median_wing: 67,
		pullus_bird_count: 1,
		juv_bird_count: 2,
		postjuv_bird_count: 1,
		adult_bird_count: 5,
		unknown_age_bird_count: 1,
		new_young_bird_count: 3,
		...overrides
	} as AggregateStatsResult;
}

describe('SpSessionTotalsTab', () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([
			buildDailyStat({ time_period: '2026-03-14' }),
			buildDailyStat({ time_period: '2026-03-21' })
		]);
	});

	it('shows a loading spinner while data is fetching', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		let resolveData!: (v: AggregateStatsResult[]) => void;
		vi.mocked(fetchSpeciesPeriodTotals).mockReturnValue(
			new Promise((resolve) => {
				resolveData = resolve;
			})
		);
		render(
			<SpSessionTotalsTab speciesName="Robin" viewedGroup={viewedGroup} />
		);
		expect(document.querySelector('.loading')).toBeDefined();
		resolveData([]);
	});

	it('fetches day-grouped totals scoped to the species, with no date range, on the all-time page', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		render(
			<SpSessionTotalsTab speciesName="Robin" viewedGroup={viewedGroup} />
		);
		await waitFor(() => {
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});
		expect(fetchSpeciesPeriodTotals).toHaveBeenCalledWith(
			'Robin',
			1,
			'day',
			undefined,
			undefined
		);
	});

	it('fetches day-grouped totals scoped to the species and the given date range, on the year page', async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		render(
			<SpSessionTotalsTab
				speciesName="Robin"
				viewedGroup={viewedGroup}
				fromDate="2026-01-01"
				toDate="2026-12-31"
			/>
		);
		await waitFor(() => {
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});
		expect(fetchSpeciesPeriodTotals).toHaveBeenCalledWith(
			'Robin',
			1,
			'day',
			'2026-01-01',
			'2026-12-31'
		);
	});

	it('renders a row per day returned by the RPC, each linking to /group/{slug}/session/{date}', async () => {
		render(
			<SpSessionTotalsTab speciesName="Robin" viewedGroup={viewedGroup} />
		);
		await waitFor(() => {
			expect(document.querySelectorAll('tbody tr').length).toBe(2);
		});
		const march14Link = screen.getByRole('link', { name: '14th March 2026' });
		const march21Link = screen.getByRole('link', { name: '21st March 2026' });
		expect(march14Link.getAttribute('href')).toBe(
			'/group/alpha/session/2026-03-14'
		);
		expect(march21Link.getAttribute('href')).toBe(
			'/group/alpha/session/2026-03-21'
		);
	});

	it("renders through PeriodTotalsTable with grouping='day'", async () => {
		render(
			<SpSessionTotalsTab speciesName="Robin" viewedGroup={viewedGroup} />
		);
		await waitFor(() => {
			expect(screen.getByTestId('period-totals-table')).toBeTruthy();
		});
		// Day-grouped rows format their label as "do MMMM yyyy" (e.g. "14th March
		// 2026"), distinct from year/month grouping's formatting — confirms
		// `grouping="day"` was actually threaded through to `PeriodTotalsTable`.
		expect(screen.getByRole('link', { name: '14th March 2026' })).toBeTruthy();
	});

	it("renders the table's empty state when the species has no sessions in range, without crashing", async () => {
		const { fetchSpeciesPeriodTotals } = await import('@/app/actions/sp-data');
		vi.mocked(fetchSpeciesPeriodTotals).mockResolvedValue([]);
		render(
			<SpSessionTotalsTab speciesName="Robin" viewedGroup={viewedGroup} />
		);
		await waitFor(() => {
			expect(screen.getByText('No data recorded.')).toBeTruthy();
		});
	});
});
