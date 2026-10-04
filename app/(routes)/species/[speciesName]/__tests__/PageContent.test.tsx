import '@/app/__tests__/helpers/mock-species-tab-components';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	within,
	waitFor,
	fireEvent
} from '@testing-library/react';
import {
	SpeciesHeading,
	SpeciesPageContent,
	buildSpeciesHeadingText,
	getDefaultSpeciesTabId,
	type FullFatPageData,
	type PageData
} from '../PageContent';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';
import type { CoreStatsWithBiometrics } from '@/app/models/db';

const {
	mockFetchYearTotalsTabData,
	mockFetchMonthTotalsTabData,
	mockFetchSessionTotalsTabData,
	mockFetchCombinedMonthTotalsTabData,
	mockFetchSquashedMonthYearTotalsTabData
} = vi.hoisted(() => ({
	mockFetchYearTotalsTabData: vi.fn(),
	mockFetchMonthTotalsTabData: vi.fn(),
	mockFetchSessionTotalsTabData: vi.fn(),
	mockFetchCombinedMonthTotalsTabData: vi.fn(),
	mockFetchSquashedMonthYearTotalsTabData: vi.fn()
}));

vi.mock('@/app/actions/sp-data', () => ({
	fetchYearTotalsTabData: mockFetchYearTotalsTabData,
	fetchMonthTotalsTabData: mockFetchMonthTotalsTabData,
	fetchSessionTotalsTabData: mockFetchSessionTotalsTabData,
	fetchCombinedMonthTotalsTabData: mockFetchCombinedMonthTotalsTabData,
	fetchSquashedMonthYearTotalsTabData: mockFetchSquashedMonthYearTotalsTabData
}));

const viewedGroup = { id: 1, slug: 'alpha' };

function buildFullFatPageData(
	overrides: Partial<Extract<PageData, FullFatPageData>> = {}
): Extract<PageData, FullFatPageData> {
	return {
		birds: [],
		speciesStats: buildCoreStatsRow() as CoreStatsWithBiometrics,
		speciesId: 1,
		speciesName: 'Robin',
		...overrides
	};
}

describe('SpeciesHeading', () => {
	afterEach(() => {
		cleanup();
	});

	describe('Usual: no period', () => {
		it('renders the bare species name with no "All time" link', () => {
			render(<SpeciesHeading speciesName="Robin" />);
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toBe('Robin');
			expect(screen.queryByRole('link', { name: 'All time' })).toBeNull();
		});

		it('renders a counts sentence below the heading when counts are given', () => {
			render(
				<SpeciesHeading
					speciesName="Robin"
					counts={{ birdCount: 59, encounterCount: 89, sessionCount: 24 }}
				/>
			);
			expect(
				screen.getByText('59 birds encountered 89 times at 24 Sessions')
			).toBeTruthy();
		});
	});

	describe('Structure: year only', () => {
		it('renders "{species} {year}" plus an "All time" link', () => {
			render(<SpeciesHeading speciesName="Robin" year={2026} />);
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toContain('Robin 2026');
			const link = within(heading).getByRole('link', { name: 'All time' });
			expect(link.getAttribute('href')).toBe('/species/Robin');
		});

		it('renders the year heading, the "All time" link and a counts sentence', () => {
			render(
				<SpeciesHeading
					speciesName="Robin"
					year={2026}
					counts={{ birdCount: 12, encounterCount: 18, sessionCount: 5 }}
				/>
			);
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toContain('Robin 2026');
			expect(
				within(heading).getByRole('link', { name: 'All time' })
			).toBeTruthy();
			expect(
				screen.getByText('12 birds encountered 18 times at 5 Sessions')
			).toBeTruthy();
		});
	});

	describe('Structure: year + month', () => {
		it('renders "{species} {long month} {year}" plus an "All time" link', () => {
			render(<SpeciesHeading speciesName="Robin" year={2026} month={8} />);
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toContain('Robin August 2026');
			const link = within(heading).getByRole('link', { name: 'All time' });
			expect(link.getAttribute('href')).toBe('/species/Robin');
		});

		it('renders the month heading, the "All time" link and a counts sentence', () => {
			render(
				<SpeciesHeading
					speciesName="Robin"
					year={2026}
					month={8}
					counts={{ birdCount: 3, encounterCount: 4, sessionCount: 2 }}
				/>
			);
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toContain('Robin August 2026');
			expect(
				within(heading).getByRole('link', { name: 'All time' })
			).toBeTruthy();
			expect(
				screen.getByText('3 birds encountered 4 times at 2 Sessions')
			).toBeTruthy();
		});
	});

	describe('Structure: no counts / unauthorised branch', () => {
		it('renders only the heading line, with no counts sentence', () => {
			render(<SpeciesHeading speciesName="Robin" year={2026} />);
			const heading = screen.getByRole('heading', { level: 1 });
			expect(heading.textContent).toContain('Robin 2026');
			expect(screen.queryByText(/encountered/)).toBeNull();
		});
	});

	describe('Edge: link href', () => {
		it('always points at the unscoped /species/{name} regardless of period depth', () => {
			const { rerender } = render(
				<SpeciesHeading speciesName="Lesser Redpoll" year={2026} />
			);
			expect(
				screen.getByRole('link', { name: 'All time' }).getAttribute('href')
			).toBe('/species/Lesser Redpoll');
			rerender(
				<SpeciesHeading speciesName="Lesser Redpoll" year={2026} month={3} />
			);
			expect(
				screen.getByRole('link', { name: 'All time' }).getAttribute('href')
			).toBe('/species/Lesser Redpoll');
		});
	});

	describe('getDefaultSpeciesTabId', () => {
		it('returns "year-totals" when isAllTime is true', () => {
			expect(getDefaultSpeciesTabId(true, false)).toBe('year-totals');
		});
		it('returns "month-totals" when isYearScoped is true and isAllTime is false', () => {
			expect(getDefaultSpeciesTabId(false, true)).toBe('month-totals');
		});
		it('returns "session-totals" when neither isAllTime nor isYearScoped is true (month-scoped)', () => {
			expect(getDefaultSpeciesTabId(false, false)).toBe('session-totals');
		});
	});

	describe('Edge: counts sentence formatting', () => {
		it('renders "0 birds encountered 0 times at 0 Sessions" for zero counts', () => {
			render(
				<SpeciesHeading
					speciesName="Robin"
					counts={{ birdCount: 0, encounterCount: 0, sessionCount: 0 }}
				/>
			);
			expect(
				screen.getByText('0 birds encountered 0 times at 0 Sessions')
			).toBeTruthy();
		});

		it('treats null counts as 0 without throwing', () => {
			render(
				<SpeciesHeading
					speciesName="Robin"
					counts={{
						birdCount: null,
						encounterCount: null,
						sessionCount: null
					}}
				/>
			);
			expect(
				screen.getByText('0 birds encountered 0 times at 0 Sessions')
			).toBeTruthy();
		});

		it('renders "1 bird encountered 1 time at 1 Session" for singular counts', () => {
			render(
				<SpeciesHeading
					speciesName="Robin"
					counts={{ birdCount: 1, encounterCount: 1, sessionCount: 1 }}
				/>
			);
			expect(
				screen.getByText('1 bird encountered 1 time at 1 Session')
			).toBeTruthy();
		});

		it('singularises only the counts that are exactly 1 in a mixed set', () => {
			render(
				<SpeciesHeading
					speciesName="Robin"
					counts={{ birdCount: 1, encounterCount: 2, sessionCount: 1 }}
				/>
			);
			expect(
				screen.getByText('1 bird encountered 2 times at 1 Session')
			).toBeTruthy();
		});
	});

	describe('buildSpeciesHeadingText', () => {
		it('returns just the name with no period', () => {
			expect(buildSpeciesHeadingText('Robin')).toBe('Robin');
		});
		it('appends the year when only a year is given', () => {
			expect(buildSpeciesHeadingText('Robin', 2026)).toBe('Robin 2026');
		});
		it('appends the long month name and year when both are given', () => {
			expect(buildSpeciesHeadingText('Robin', 2026, 8)).toBe(
				'Robin August 2026'
			);
		});
	});
});

// `SpeciesData`'s 6 data-fetching tabs now render through the shared
// `TabSet` (#1065 landed Year/Month/Session totals; #1066 appended all-time
// Month totals, squashed-month Year totals and Highlights), with their own
// tab strip (`ariaLabel="Totals"`) separate from the pre-existing
// `TabNav`-driven strip (default `ariaLabel` "Tabs") covering the remaining 3
// tabs not yet migrated (Biometrics/Demographics/Bird list) — see
// `SpeciesData`'s own doc comment in `PageContent.tsx` for why there are
// deliberately two strips for the interim. `screen.getByRole('tablist', {
// name: ... })` distinguishes between them.
describe('TabSet-based totals tabs', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	beforeEach(() => {
		mockFetchYearTotalsTabData.mockResolvedValue([]);
		mockFetchMonthTotalsTabData.mockResolvedValue([]);
		mockFetchSessionTotalsTabData.mockResolvedValue([]);
		mockFetchCombinedMonthTotalsTabData.mockResolvedValue({
			monthlyStats: [],
			monthSquashedStats: []
		});
		mockFetchSquashedMonthYearTotalsTabData.mockResolvedValue([]);
	});

	it('renders TabSet with Year totals, Session totals, all-time Month totals and Highlights at the all-time route depth', async () => {
		render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData()}
				viewedGroup={viewedGroup}
			/>
		);
		const totalsTabs = screen.getByRole('tablist', { name: 'Totals' });
		expect(
			within(totalsTabs).getByRole('button', { name: 'Year totals' })
		).toBeTruthy();
		expect(
			within(totalsTabs).getByRole('button', { name: 'Session totals' })
		).toBeTruthy();
		expect(
			within(totalsTabs).getByRole('button', { name: 'Month totals' })
		).toBeTruthy();
		expect(
			within(totalsTabs).getByRole('button', { name: 'Highlights' })
		).toBeTruthy();
		expect(within(totalsTabs).getAllByRole('button')).toHaveLength(4);
		await screen.findByTestId('sp-year-totals-tab');
	});

	it('renders TabSet with month-totals instead of year-totals at the year-scoped route depth, and no all-time Month totals slot', async () => {
		render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData({ year: 2026 })}
				viewedGroup={viewedGroup}
			/>
		);
		const totalsTabs = screen.getByRole('tablist', { name: 'Totals' });
		expect(
			within(totalsTabs).getByRole('button', { name: 'Month totals' })
		).toBeTruthy();
		expect(
			within(totalsTabs).getByRole('button', { name: 'Session totals' })
		).toBeTruthy();
		expect(
			within(totalsTabs).getByRole('button', { name: 'Highlights' })
		).toBeTruthy();
		expect(
			within(totalsTabs).queryByRole('button', { name: 'Year totals' })
		).toBeNull();
		// Exactly one "Month totals" button — year-scoped's own, not the
		// all-time one (mutually exclusive route depths).
		expect(within(totalsTabs).getAllByRole('button')).toHaveLength(3);
		await screen.findByTestId('sp-month-totals-tab');
	});

	it('renders TabSet with session-totals, the squashed-month Year totals and Highlights at the squashed-month route depth', async () => {
		render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData({ squashedMonth: 3 })}
				viewedGroup={viewedGroup}
			/>
		);
		const totalsTabs = screen.getByRole('tablist', { name: 'Totals' });
		expect(
			within(totalsTabs).getByRole('button', { name: 'Session totals' })
		).toBeTruthy();
		expect(
			within(totalsTabs).getByRole('button', { name: 'Year totals' })
		).toBeTruthy();
		expect(
			within(totalsTabs).getByRole('button', { name: 'Highlights' })
		).toBeTruthy();
		expect(within(totalsTabs).getAllByRole('button')).toHaveLength(3);
		fireEvent.click(
			within(totalsTabs).getByRole('button', { name: 'Year totals' })
		);
		await screen.findByTestId('sp-squashed-month-year-totals-tab');
	});

	it('passes initialTabData through to TabSet when the resolved initial tab is one of the 6 migrated tabs', async () => {
		render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData({
					initialTabId: 'year-totals',
					initialTabData: {
						tabId: 'year-totals',
						data: [buildCoreStatsRow({ time_period: '2026-01-01' })]
					}
				})}
				viewedGroup={viewedGroup}
			/>
		);
		// Prefetched data renders immediately with no spinner and no client fetch.
		expect(screen.getByTestId('sp-year-totals-tab')).toBeTruthy();
		expect(mockFetchYearTotalsTabData).not.toHaveBeenCalled();
	});

	it('omits initialTabData when the resolved initial tab is one of the 3 not-yet-migrated tabs', async () => {
		render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData({ initialTabId: 'biometrics' })}
				viewedGroup={viewedGroup}
			/>
		);
		// TabSet's own tab strip falls back to its own default (`year-totals`)
		// and fetches client-side, since the real initial tab lives in the old
		// mechanism's strip instead.
		await waitFor(() => {
			expect(mockFetchYearTotalsTabData).toHaveBeenCalled();
		});
		await screen.findByTestId('sp-biometrics-tab');
	});
});

describe('SpeciesData tab list', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	beforeEach(() => {
		mockFetchYearTotalsTabData.mockResolvedValue([]);
		mockFetchMonthTotalsTabData.mockResolvedValue([]);
		mockFetchSessionTotalsTabData.mockResolvedValue([]);
		mockFetchCombinedMonthTotalsTabData.mockResolvedValue({
			monthlyStats: [],
			monthSquashedStats: []
		});
		mockFetchSquashedMonthYearTotalsTabData.mockResolvedValue([]);
	});

	it('includes all-time-month-totals only when isAllTime', () => {
		const { unmount } = render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData()}
				viewedGroup={viewedGroup}
			/>
		);
		expect(
			within(screen.getByRole('tablist', { name: 'Totals' })).getByRole(
				'button',
				{ name: 'Month totals' }
			)
		).toBeTruthy();
		unmount();

		render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData({ squashedMonth: 3 })}
				viewedGroup={viewedGroup}
			/>
		);
		expect(
			within(screen.getByRole('tablist', { name: 'Totals' })).queryByRole(
				'button',
				{ name: 'Month totals' }
			)
		).toBeNull();
	});

	it('includes squashed-month-year-totals only when isSquashedMonth', () => {
		const { unmount } = render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData({ squashedMonth: 3 })}
				viewedGroup={viewedGroup}
			/>
		);
		expect(
			within(screen.getByRole('tablist', { name: 'Totals' })).getByRole(
				'button',
				{ name: 'Year totals' }
			)
		).toBeTruthy();
		unmount();

		render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData()}
				viewedGroup={viewedGroup}
			/>
		);
		// The all-time page's own "Year totals" (year-totals, not the squashed
		// one) is still present — only one such button either way.
		expect(
			within(screen.getByRole('tablist', { name: 'Totals' })).getAllByRole(
				'button',
				{ name: 'Year totals' }
			)
		).toHaveLength(1);
	});

	it('always includes highlights regardless of period scope', () => {
		const depths: Partial<Extract<PageData, FullFatPageData>>[] = [
			{},
			{ year: 2026 },
			{ year: 2026, month: 8 },
			{ squashedMonth: 3 }
		];
		for (const overrides of depths) {
			const { unmount } = render(
				<SpeciesPageContent
					params={{ speciesName: 'Robin' }}
					data={buildFullFatPageData(overrides)}
					viewedGroup={viewedGroup}
				/>
			);
			expect(
				within(screen.getByRole('tablist', { name: 'Totals' })).getByRole(
					'button',
					{ name: 'Highlights' }
				)
			).toBeTruthy();
			unmount();
		}
	});
});

describe('legacy tab rendering for not-yet-migrated tabs', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	beforeEach(() => {
		mockFetchYearTotalsTabData.mockResolvedValue([]);
		mockFetchMonthTotalsTabData.mockResolvedValue([]);
		mockFetchSessionTotalsTabData.mockResolvedValue([]);
		mockFetchCombinedMonthTotalsTabData.mockResolvedValue({
			monthlyStats: [],
			monthSquashedStats: []
		});
		mockFetchSquashedMonthYearTotalsTabData.mockResolvedValue([]);
	});

	it('still renders Biometrics/Demographics/Bird list via the existing ConditionalTabPanel mechanism, unaffected by the TabSet changes', async () => {
		render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData({ squashedMonth: 3 })}
				viewedGroup={viewedGroup}
			/>
		);
		const legacyTabs = screen.getByRole('tablist', { name: 'Tabs' });
		expect(within(legacyTabs).getAllByRole('button')).toHaveLength(3);
		const cases: [string, string][] = [
			['Biometrics', 'sp-biometrics-tab'],
			['Demographics', 'sp-demographics-tab'],
			['Bird list', 'sp-individuals-tab']
		];
		for (const [label, testId] of cases) {
			fireEvent.click(within(legacyTabs).getByRole('button', { name: label }));
			await screen.findByTestId(testId);
		}
	});
});
