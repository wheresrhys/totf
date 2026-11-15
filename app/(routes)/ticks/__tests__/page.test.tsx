import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Page from '../page';
import type { GroupTicksResult } from '@/app/models/db';
import type { TemporalSearchParams } from '@/app/lib/temporal-filter';

const { mockGetAuthenticatedSupabaseClient } = vi.hoisted(() => ({
	mockGetAuthenticatedSupabaseClient: vi.fn()
}));

vi.mock('@/app/lib/auth/group-auth', () => ({
	getAuthenticatedSupabaseClient: mockGetAuthenticatedSupabaseClient
}));

const FIRST_YEAR = 2024;

const allTimeTicks: GroupTicksResult[] = [
	{
		species_name: 'Carrion Crow',
		first_encounter_date: '2026-05-02',
		is_first_ever: true
	},
	{
		species_name: 'Robin',
		first_encounter_date: '2025-11-20',
		is_first_ever: true
	},
	{
		species_name: 'Blue Tit',
		first_encounter_date: `${FIRST_YEAR}-03-01`,
		is_first_ever: true
	}
];

const periodTicks: GroupTicksResult[] = [
	{
		species_name: 'Carrion Crow',
		first_encounter_date: '2026-05-02',
		is_first_ever: true
	},
	{
		species_name: 'Blue Tit',
		first_encounter_date: '2026-04-10',
		is_first_ever: false
	}
];

function isFilteredCall(args: Record<string, unknown>) {
	return ['from_date', 'to_date', 'year_filter', 'month_filter'].some(
		(key) => args[key] !== undefined
	);
}

// Unfiltered `group_ticks` calls get `allTime`; filtered ones get `filtered`.
function makeRpcClient({
	allTime = allTimeTicks,
	filtered = periodTicks
}: { allTime?: GroupTicksResult[]; filtered?: GroupTicksResult[] } = {}) {
	return {
		rpc: vi.fn((_: string, args: Record<string, unknown>) => ({
			then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
				Promise.resolve({
					data: isFilteredCall(args) ? filtered : allTime,
					error: null
				}).then(resolve)
		}))
	};
}

let rpcClient: ReturnType<typeof makeRpcClient>;

async function renderTicksPage(searchParams?: TemporalSearchParams) {
	render(
		await Page(
			searchParams ? { searchParams: Promise.resolve(searchParams) } : {}
		)
	);
	return screen.findByRole('heading', { level: 1 });
}

function getListItemTexts() {
	return Array.from(screen.getByRole('list').querySelectorAll('li')).map(
		(item) => item.textContent
	);
}

describe('ticks page', () => {
	beforeEach(() => {
		rpcClient = makeRpcClient();
		mockGetAuthenticatedSupabaseClient.mockResolvedValue(rpcClient);
	});

	afterEach(() => {
		cleanup();
	});

	it('renders a plain "Ticks" heading when unfiltered', async () => {
		const heading = await renderTicksPage();
		expect(heading.textContent).toBe('Ticks');
	});

	it('renders one entry per tick, numbered in reverse and formatted as "{n}. {species} on {date}"', async () => {
		await renderTicksPage();
		expect(getListItemTexts()).toEqual([
			'3. Carrion Crow on 2nd May 2026',
			'2. Robin on 20th November 2025',
			'1. Blue Tit on 1st March 2024'
		]);
	});

	describe('temporal filtering', () => {
		it('passes the selected year/month/date range to group_ticks in scope mode', async () => {
			await renderTicksPage({
				year: '2026',
				month: '4',
				fromDate: '2026-04-05',
				toDate: '2026-04-20'
			});
			expect(rpcClient.rpc).toHaveBeenCalledWith('group_ticks', {
				ringing_group_filter: 1,
				temporal_filter_mode: 'scope',
				from_date: '2026-04-05',
				to_date: '2026-04-20',
				year_filter: 2026,
				month_filter: 4
			});
		});

		it('titles the heading with the selected period, e.g. "Ticks for November 2026"', async () => {
			const heading = await renderTicksPage({ year: '2026', month: '11' });
			expect(heading.textContent).toBe('Ticks for November 2026');
		});

		it("offers every year from the group's first year to the current year", async () => {
			await renderTicksPage({ year: '2026' });
			const yearOptions = Array.from(
				(screen.getByLabelText('Year') as HTMLSelectElement).options
			).map((option) => option.textContent);
			const currentYear = new Date().getFullYear();
			const expectedYears = Array.from(
				{ length: currentYear - FIRST_YEAR + 1 },
				(_, index) => String(FIRST_YEAR + index)
			);
			expect(yearOptions).toEqual(['All', ...expectedYears]);
		});

		it('seeds the controls from the URL search params', async () => {
			await renderTicksPage({ year: '2026', month: '4' });
			expect((screen.getByLabelText('Year') as HTMLSelectElement).value).toBe(
				'2026'
			);
			expect((screen.getByLabelText('Month') as HTMLSelectElement).value).toBe(
				'4'
			);
		});
	});

	describe('first ever badges', () => {
		it('shows no badges when no filter is applied', async () => {
			await renderTicksPage();
			expect(screen.queryAllByTestId('first-ever-badge')).toHaveLength(0);
		});

		it('badges only is_first_ever rows when a non-first year is selected', async () => {
			await renderTicksPage({ year: '2026' });
			expect(getListItemTexts()).toEqual([
				'2. Carrion Crow on 2nd May 2026first ever',
				'1. Blue Tit on 10th April 2026'
			]);
		});

		it("shows no badges when the group's first year is selected", async () => {
			await renderTicksPage({ year: String(FIRST_YEAR) });
			expect(screen.queryAllByTestId('first-ever-badge')).toHaveLength(0);
		});

		it('badges is_first_ever rows for a date-range-only filter', async () => {
			await renderTicksPage({ fromDate: '2026-01-01' });
			expect(screen.getAllByTestId('first-ever-badge')).toHaveLength(1);
		});
	});

	describe('with no ticks', () => {
		it('renders "No ticks yet." when unfiltered', async () => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeRpcClient({ allTime: [] })
			);
			await renderTicksPage();
			expect(screen.queryByRole('list')).toBeNull();
			expect(screen.getByText('No ticks yet.')).toBeDefined();
		});

		it('renders "No ticks in this period." when filtered', async () => {
			mockGetAuthenticatedSupabaseClient.mockResolvedValue(
				makeRpcClient({ filtered: [] })
			);
			await renderTicksPage({ year: '2026' });
			expect(screen.queryByRole('list')).toBeNull();
			expect(screen.getByText('No ticks in this period.')).toBeDefined();
		});
	});
});
