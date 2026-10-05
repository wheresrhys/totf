import '@/app/__tests__/helpers/mock-species-tab-components';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	within,
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

// `SpeciesData`'s 9 tabs all render through one single shared `TabSet` now
// (#1065 landed Year/Month/Session totals; #1066 appended all-time Month
// totals, squashed-month Year totals and Highlights; #1060 appended
// Biometrics/Demographics/Bird list, species' finish line for the
// tab-unification initiative) — a single `tablist` (default `ariaLabel`
// "Tabs") covers every tab, so `screen.getByRole('tablist')` always resolves
// to the one strip.
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

	it('renders TabSet with Year totals, Session totals, all-time Month totals, Highlights and the 3 detail tabs at the all-time route depth', async () => {
		render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData()}
				viewedGroup={viewedGroup}
			/>
		);
		const tabs = screen.getByRole('tablist');
		expect(
			within(tabs).getByRole('button', { name: 'Year totals' })
		).toBeTruthy();
		expect(
			within(tabs).getByRole('button', { name: 'Session totals' })
		).toBeTruthy();
		expect(
			within(tabs).getByRole('button', { name: 'Month totals' })
		).toBeTruthy();
		expect(
			within(tabs).getByRole('button', { name: 'Highlights' })
		).toBeTruthy();
		expect(
			within(tabs).getByRole('button', { name: 'Biometrics' })
		).toBeTruthy();
		expect(
			within(tabs).getByRole('button', { name: 'Demographics' })
		).toBeTruthy();
		expect(
			within(tabs).getByRole('button', { name: 'Bird list' })
		).toBeTruthy();
		// Year totals, Session totals, Month totals, Highlights, Biometrics,
		// Demographics, Bird list.
		expect(within(tabs).getAllByRole('button')).toHaveLength(7);
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
		const tabs = screen.getByRole('tablist');
		expect(
			within(tabs).getByRole('button', { name: 'Month totals' })
		).toBeTruthy();
		expect(
			within(tabs).getByRole('button', { name: 'Session totals' })
		).toBeTruthy();
		expect(
			within(tabs).getByRole('button', { name: 'Highlights' })
		).toBeTruthy();
		expect(
			within(tabs).queryByRole('button', { name: 'Year totals' })
		).toBeNull();
		// Exactly one "Month totals" button — year-scoped's own, not the
		// all-time one (mutually exclusive route depths).
		// Month totals, Session totals, Highlights, Biometrics, Demographics,
		// Bird list.
		expect(within(tabs).getAllByRole('button')).toHaveLength(6);
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
		const tabs = screen.getByRole('tablist');
		expect(
			within(tabs).getByRole('button', { name: 'Session totals' })
		).toBeTruthy();
		expect(
			within(tabs).getByRole('button', { name: 'Year totals' })
		).toBeTruthy();
		expect(
			within(tabs).getByRole('button', { name: 'Highlights' })
		).toBeTruthy();
		// Session totals, Year totals, Highlights, Biometrics, Demographics,
		// Bird list.
		expect(within(tabs).getAllByRole('button')).toHaveLength(6);
		fireEvent.click(within(tabs).getByRole('button', { name: 'Year totals' }));
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

	it('resolves directly to a dataFetcher: undefined detail tab when it is the resolved initial tab, fetching no totals tab at all', async () => {
		render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData({ initialTabId: 'biometrics' })}
				viewedGroup={viewedGroup}
			/>
		);
		// Biometrics is now a real entry in the same `TabSet`/`tabIds` list, so
		// it becomes the active/loaded tab directly — Year totals (the route's
		// own default) never mounts and never fetches.
		await screen.findByTestId('sp-biometrics-tab');
		expect(mockFetchYearTotalsTabData).not.toHaveBeenCalled();
		expect(screen.queryByTestId('sp-year-totals-tab')).toBeNull();
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
			within(screen.getByRole('tablist')).getByRole('button', {
				name: 'Month totals'
			})
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
			within(screen.getByRole('tablist')).queryByRole('button', {
				name: 'Month totals'
			})
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
			within(screen.getByRole('tablist')).getByRole('button', {
				name: 'Year totals'
			})
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
			within(screen.getByRole('tablist')).getAllByRole('button', {
				name: 'Year totals'
			})
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
				within(screen.getByRole('tablist')).getByRole('button', {
					name: 'Highlights'
				})
			).toBeTruthy();
			unmount();
		}
	});

	it('always includes the 3 dataFetcher: undefined detail tabs regardless of period scope', () => {
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
			const tabs = screen.getByRole('tablist');
			expect(
				within(tabs).getByRole('button', { name: 'Biometrics' })
			).toBeTruthy();
			expect(
				within(tabs).getByRole('button', { name: 'Demographics' })
			).toBeTruthy();
			expect(
				within(tabs).getByRole('button', { name: 'Bird list' })
			).toBeTruthy();
			unmount();
		}
	});
});

// `SpeciesData`'s Biometrics/Demographics/Bird list tabs (#1060) now render
// through the same single `TabSet` as every other species tab, each a
// `dataFetcher: undefined` entry whose `TabComponent` is a thin adapter
// mapping `TabSet`'s shared `params`/`viewedGroup` onto the existing
// `SpBiometricsTab`/`SpDemographicsTab`/`SpIndividualsTab`'s own prop names —
// none of those 3 components' own internals change, so
// `mock-species-tab-components.tsx` stubs them out rendering their received
// props as JSON text, letting these tests assert the adapter mapped them
// correctly without exercising the real (heavier) tab content.
describe('species detail tabs (dataFetcher: undefined)', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	beforeEach(() => {
		// The totals tabs still render alongside these in the same `TabSet` on
		// every `SpeciesPageContent` render — their own `dataFetcher`s need a
		// resolvable mock regardless of which tab this describe block is
		// exercising.
		mockFetchYearTotalsTabData.mockResolvedValue([]);
		mockFetchMonthTotalsTabData.mockResolvedValue([]);
		mockFetchSessionTotalsTabData.mockResolvedValue([]);
	});

	async function renderPropsOf(testId: string) {
		const element = await screen.findByTestId(testId);
		return JSON.parse(element.textContent ?? '{}');
	}

	describe('Biometrics tab', () => {
		it('renders SpBiometricsTab with data: null routed through the adapter, with speciesStats/speciesName/speciesId/fromDate/toDate/viewedGroup mapped correctly from params/viewedGroup', async () => {
			const speciesStats = buildCoreStatsRow() as CoreStatsWithBiometrics;
			render(
				<SpeciesPageContent
					params={{ speciesName: 'Robin' }}
					data={buildFullFatPageData({
						speciesStats,
						speciesId: 7,
						fromDate: '2026-01-01',
						toDate: '2026-12-31',
						initialTabId: 'biometrics'
					})}
					viewedGroup={viewedGroup}
				/>
			);
			expect(await renderPropsOf('sp-biometrics-tab')).toMatchObject({
				speciesStats,
				speciesName: 'Robin',
				speciesId: 7,
				viewedGroup,
				fromDate: '2026-01-01',
				toDate: '2026-12-31'
			});
		});
	});

	describe('Demographics tab', () => {
		it('renders SpDemographicsTab with data: null routed through the adapter, with speciesName/fromDate/toDate/viewedGroup mapped correctly from params/viewedGroup', async () => {
			render(
				<SpeciesPageContent
					params={{ speciesName: 'Robin' }}
					data={buildFullFatPageData({
						fromDate: '2026-01-01',
						toDate: '2026-12-31',
						initialTabId: 'demographics'
					})}
					viewedGroup={viewedGroup}
				/>
			);
			expect(await renderPropsOf('sp-demographics-tab')).toMatchObject({
				speciesName: 'Robin',
				viewedGroup,
				fromDate: '2026-01-01',
				toDate: '2026-12-31'
			});
		});
	});

	describe('Individuals ("Bird list") tab', () => {
		it('renders SpIndividualsTab with data: null routed through the adapter, with speciesId/birds/birdCount/fromDate/toDate/viewedGroup mapped correctly from params/viewedGroup', async () => {
			const birds: FullFatPageData['birds'] = [];
			render(
				<SpeciesPageContent
					params={{ speciesName: 'Robin' }}
					data={buildFullFatPageData({
						birds,
						speciesId: 7,
						speciesStats: buildCoreStatsRow({
							bird_count: 12
						}) as CoreStatsWithBiometrics,
						fromDate: '2026-01-01',
						toDate: '2026-12-31',
						initialTabId: 'bird-list'
					})}
					viewedGroup={viewedGroup}
				/>
			);
			expect(await renderPropsOf('sp-individuals-tab')).toMatchObject({
				speciesId: 7,
				birds,
				birdCount: 12,
				viewedGroup,
				fromDate: '2026-01-01',
				toDate: '2026-12-31'
			});
		});

		it('derives birdCount from params.speciesStats.bird_count, defaulting to 0 when null', async () => {
			// `CoreStatsResult.bird_count` is non-null (`NonNullable`-stripped,
			// app/models/db.ts) even though the underlying RPC can return `null`
			// for an ungrouped row with zero birds — a literal `null` override
			// needs the documented `as unknown as` escape hatch (app/CLAUDE.md).
			// eslint-disable-next-line no-restricted-syntax -- see comment above
			const speciesStats = {
				...buildCoreStatsRow(),
				bird_count: null
			} as unknown as CoreStatsWithBiometrics;
			render(
				<SpeciesPageContent
					params={{ speciesName: 'Robin' }}
					data={buildFullFatPageData({
						speciesStats,
						initialTabId: 'bird-list'
					})}
					viewedGroup={viewedGroup}
				/>
			);
			expect(await renderPropsOf('sp-individuals-tab')).toMatchObject({
				birdCount: 0
			});
		});
	});
});
