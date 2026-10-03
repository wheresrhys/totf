import { describe, it, expect, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	getAllByRole
} from '@testing-library/react';
import { SquashedMonthSummaryTotalsSection } from '../SquashedMonthSummaryTotalsSection';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { SpeciesStatsRow } from '@/app/lib/species-stats';
import {
	buildCoreStatsRow,
	buildDailyStatsRow
} from '@/app/__tests__/helpers/core-stats-fixtures';

const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

const speciesTotalsForMonth = [
	{ ...buildCoreStatsRow({ species_name: 'Robin' }) } as SpeciesStatsRow
];

const yearTotalsForMonth = [
	buildCoreStatsRow({ time_period: '2024-01-01' }),
	buildCoreStatsRow({ time_period: '2025-01-01' })
];

const sessionTotalsForMonth = [
	buildDailyStatsRow({ time_period: '2025-01-16' })
];

describe('SquashedMonthSummaryTotalsSection', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders Species totals, Year totals, Session totals in that order, Species totals active by default', () => {
		render(
			<SquashedMonthSummaryTotalsSection
				squashedMonth={1}
				speciesTotalsForMonth={speciesTotalsForMonth}
				yearTotalsForMonth={yearTotalsForMonth}
				sessionTotalsForMonth={sessionTotalsForMonth}
				viewedGroup={viewedGroup}
			/>
		);
		const tabs = getAllByRole(screen.getByRole('tablist'), 'button');
		expect(tabs.map((tab) => tab.textContent)).toEqual([
			'Species totals',
			'Year totals',
			'Session totals',
			'Highlights'
		]);
		expect(tabs[0].getAttribute('aria-current')).toBe('true');
	});

	it('renders the species table by default, linking each species name to the squashed-month species page', () => {
		render(
			<SquashedMonthSummaryTotalsSection
				squashedMonth={1}
				speciesTotalsForMonth={speciesTotalsForMonth}
				yearTotalsForMonth={yearTotalsForMonth}
				sessionTotalsForMonth={sessionTotalsForMonth}
				viewedGroup={viewedGroup}
			/>
		);
		expect(
			screen.getByRole('link', { name: 'Robin' }).getAttribute('href')
		).toBe('/species/Robin/jan?tabId=species-totals');
	});

	describe('Year totals tab', () => {
		it('labels each row "{month name} {year}" and links into the specific year/month summary page', () => {
			render(
				<SquashedMonthSummaryTotalsSection
					squashedMonth={1}
					speciesTotalsForMonth={speciesTotalsForMonth}
					yearTotalsForMonth={yearTotalsForMonth}
					sessionTotalsForMonth={sessionTotalsForMonth}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Year totals' }));
			const link2024 = screen.getByRole('link', { name: 'January 2024' });
			expect(link2024.getAttribute('href')).toBe(
				'/group/alpha/summary/2024/1?tabId=year-totals'
			);
			const link2025 = screen.getByRole('link', { name: 'January 2025' });
			expect(link2025.getAttribute('href')).toBe(
				'/group/alpha/summary/2025/1?tabId=year-totals'
			);
		});

		it('uses the requested squashed month for every row regardless of its own bucket month', () => {
			render(
				<SquashedMonthSummaryTotalsSection
					squashedMonth={12}
					speciesTotalsForMonth={speciesTotalsForMonth}
					yearTotalsForMonth={yearTotalsForMonth}
					sessionTotalsForMonth={sessionTotalsForMonth}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Year totals' }));
			expect(screen.getByText('December 2024')).toBeTruthy();
			expect(
				screen.getByRole('link', { name: 'December 2024' }).getAttribute('href')
			).toBe('/group/alpha/summary/2024/12?tabId=year-totals');
		});
	});

	describe('Session totals tab', () => {
		it('links each session day to the group-scoped session route', () => {
			render(
				<SquashedMonthSummaryTotalsSection
					squashedMonth={1}
					speciesTotalsForMonth={speciesTotalsForMonth}
					yearTotalsForMonth={yearTotalsForMonth}
					sessionTotalsForMonth={sessionTotalsForMonth}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			expect(
				screen
					.getByRole('link', { name: '16th January 2025' })
					.getAttribute('href')
			).toBe('/group/alpha/session/2025-01-16?tabId=session-totals');
		});
	});

	describe('Edge', () => {
		it('renders the shared empty state for each tab when its rows are empty', () => {
			render(
				<SquashedMonthSummaryTotalsSection
					squashedMonth={1}
					speciesTotalsForMonth={[]}
					yearTotalsForMonth={[]}
					sessionTotalsForMonth={[]}
					viewedGroup={viewedGroup}
				/>
			);
			expect(screen.getByText('No species recorded.')).toBeTruthy();
			fireEvent.click(screen.getByRole('button', { name: 'Year totals' }));
			expect(screen.getByText('No data recorded.')).toBeTruthy();
			fireEvent.click(screen.getByRole('button', { name: 'Session totals' }));
			expect(screen.getByText('No data recorded.')).toBeTruthy();
		});
	});
});
