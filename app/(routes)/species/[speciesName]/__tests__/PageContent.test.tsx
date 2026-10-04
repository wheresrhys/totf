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
	mockFetchSessionTotalsTabData
} = vi.hoisted(() => ({
	mockFetchYearTotalsTabData: vi.fn(),
	mockFetchMonthTotalsTabData: vi.fn(),
	mockFetchSessionTotalsTabData: vi.fn()
}));

vi.mock('@/app/actions/sp-data', () => ({
	fetchYearTotalsTabData: mockFetchYearTotalsTabData,
	fetchMonthTotalsTabData: mockFetchMonthTotalsTabData,
	fetchSessionTotalsTabData: mockFetchSessionTotalsTabData
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

// `SpeciesData`'s Year/Month/Session totals tabs now render through the
// shared `TabSet` (#1065), with their own tab strip (`ariaLabel="Totals"`)
// separate from the pre-existing `TabNav`-driven strip (default `ariaLabel`
// "Tabs") covering the 6 tabs not yet migrated — see `SpeciesData`'s own doc
// comment in `PageContent.tsx` for why there are deliberately two strips for
// the interim. `screen.getByRole('tablist', { name: ... })` distinguishes
// between them.
describe('TabSet-based totals tabs', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	beforeEach(() => {
		mockFetchYearTotalsTabData.mockResolvedValue([]);
		mockFetchMonthTotalsTabData.mockResolvedValue([]);
		mockFetchSessionTotalsTabData.mockResolvedValue([]);
	});

	it('renders TabSet with the 3 in-scope tabs at the all-time route depth (year-totals present)', async () => {
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
			within(totalsTabs).queryByRole('button', { name: 'Month totals' })
		).toBeNull();
		await screen.findByTestId('sp-year-totals-tab');
	});

	it('renders TabSet with month-totals instead of year-totals at the year-scoped route depth', async () => {
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
			within(totalsTabs).queryByRole('button', { name: 'Year totals' })
		).toBeNull();
		await screen.findByTestId('sp-month-totals-tab');
	});

	// Deviates from #1065's literal scope-bullet wording, which lists
	// `squashed-month-year-totals` as part of the migrated `TabConfig[]` — but
	// the ticket's own "Out of scope" section lists "Squashed Month/Year
	// Totals" among the 6 *not* migrated, and the 3-in-scope/6-not-migrated
	// tab-id counts only add up to the pre-existing 9 total ids if
	// `squashed-month-year-totals` stays in the 6. Treated here as a drafting
	// slip in the scope bullet, not a real requirement — see
	// `buildSpeciesTotalsTabs`'s doc comment in `PageContent.tsx`.
	it('renders TabSet with only session-totals (no year/month slot) at the squashed-month route depth, leaving squashed-month-year-totals on the old mechanism', async () => {
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
		expect(within(totalsTabs).getAllByRole('button')).toHaveLength(1);
		const legacyTabs = screen.getByRole('tablist', { name: 'Tabs' });
		expect(
			within(legacyTabs).getByRole('button', { name: 'Year totals' })
		).toBeTruthy();
		fireEvent.click(
			within(legacyTabs).getByRole('button', { name: 'Year totals' })
		);
		await screen.findByTestId('sp-squashed-month-year-totals-tab');
	});

	it('passes initialTabData through to TabSet when the resolved initial tab is one of the 3 in-scope tabs', async () => {
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

	it('omits initialTabData when the resolved initial tab is one of the 6 not-yet-migrated tabs', async () => {
		render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData({ initialTabId: 'highlights' })}
				viewedGroup={viewedGroup}
			/>
		);
		// TabSet's own tab strip falls back to its own default (`year-totals`)
		// and fetches client-side, since the real initial tab lives in the old
		// mechanism's strip instead.
		await waitFor(() => {
			expect(mockFetchYearTotalsTabData).toHaveBeenCalled();
		});
		await screen.findByTestId('sp-highlights-tab');
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
	});

	it('still renders Highlights/Biometrics/Demographics/Individuals/Combined/Squashed tabs via the existing ConditionalTabPanel mechanism, unaffected by the TabSet changes', async () => {
		render(
			<SpeciesPageContent
				params={{ speciesName: 'Robin' }}
				data={buildFullFatPageData({ squashedMonth: 3 })}
				viewedGroup={viewedGroup}
			/>
		);
		const legacyTabs = screen.getByRole('tablist', { name: 'Tabs' });
		const cases: [string, string][] = [
			['Year totals', 'sp-squashed-month-year-totals-tab'],
			['Highlights', 'sp-highlights-tab'],
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
