import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SpeciesTotalsSection } from '../SpeciesTotalsSection';
import speciesDataSnapshot from '@/test-fixtures/snapshots/fetchSpeciesData.alpha.json';
import type { AggregateStatsResult } from '@/app/models/db';
import type { ViewedGroup } from '@/lib/group-slug';

const speciesStats = speciesDataSnapshot as unknown as AggregateStatsResult[];

const viewedGroup: ViewedGroup = { id: 1, slug: 'alpha' };

function buildDayStat(
	overrides: Partial<AggregateStatsResult> = {}
): AggregateStatsResult {
	return {
		species_name: null,
		time_period: '2026-08-16',
		session_count: 2,
		total_effort: '06:00:00',
		effort_per_session: '03:00:00',
		effort_per_encounter: '00:30:00',
		avg_encounters_per_session: 6,
		max_per_session: 8,
		species_count: 5,
		bird_count: 12,
		encounter_count: 14,
		new_bird_count: 9,
		max_new_per_session: 6,
		max_weight: 13.1,
		avg_weight: 11.2,
		min_weight: 9.8,
		median_weight: 10.8,
		max_wing: 68,
		avg_wing: 66.6,
		min_wing: 65,
		median_wing: 67,
		pullus_count: 1,
		juv_count: 2,
		postjuv_count: 1,
		adult_count: 6,
		unknown_age_count: 2,
		new_young_count: 3,
		...overrides
	} as AggregateStatsResult;
}

describe('SpeciesTotalsSection', () => {
	afterEach(() => {
		cleanup();
	});

	describe('without session totals (all-time / year summary pages)', () => {
		it('renders a single "Species totals" tab, active by default, with the table content visible beneath it', () => {
			render(<SpeciesTotalsSection speciesStats={speciesStats} />);
			const tab = screen.getByRole('button', { name: 'Species totals' });
			expect(tab.getAttribute('aria-current')).toBe('true');
			expect(document.querySelectorAll('tbody tr').length).toBe(
				speciesStats.length
			);
		});

		it("renders the table's empty state when speciesStats is empty, without crashing", () => {
			render(<SpeciesTotalsSection speciesStats={[]} />);
			expect(
				screen.getByRole('button', { name: 'Species totals' })
			).toBeTruthy();
			expect(document.querySelectorAll('tbody tr').length).toBe(0);
		});

		it('does not render a "Session totals" tab', () => {
			render(<SpeciesTotalsSection speciesStats={speciesStats} />);
			expect(
				screen.queryByRole('button', { name: 'Session totals' })
			).toBeNull();
		});
	});

	describe('with session totals (month summary page)', () => {
		it('renders "Session totals" as the first tab, active by default, with "Species totals" present as a second tab', () => {
			render(
				<SpeciesTotalsSection
					speciesStats={speciesStats}
					sessionTotals={[buildDayStat()]}
					viewedGroup={viewedGroup}
				/>
			);
			const tabs = screen.getAllByRole('button');
			expect(tabs.map((tab) => tab.textContent)).toEqual([
				'Session totals',
				'Species totals'
			]);
			expect(
				screen
					.getByRole('button', { name: 'Session totals' })
					.getAttribute('aria-current')
			).toBe('true');
		});

		it('renders one row per session day, in the order supplied, each linking to the session-temp route with the date formatted "16th August 2026"', () => {
			render(
				<SpeciesTotalsSection
					speciesStats={speciesStats}
					sessionTotals={[
						buildDayStat({ time_period: '2026-08-02' }),
						buildDayStat({ time_period: '2026-08-16' })
					]}
					viewedGroup={viewedGroup}
				/>
			);
			const links = screen
				.getAllByRole('link')
				.filter((link) =>
					link.getAttribute('href')?.includes('/session-temp/')
				);
			expect(links.map((link) => link.textContent?.trim())).toEqual([
				'2nd August 2026',
				'16th August 2026'
			]);
			expect(links.map((link) => link.getAttribute('href'))).toEqual([
				'/group/alpha/session-temp/2026-08-02',
				'/group/alpha/session-temp/2026-08-16'
			]);
		});

		it('switches to the "Species totals" table when its tab is clicked', () => {
			render(
				<SpeciesTotalsSection
					speciesStats={speciesStats}
					sessionTotals={[buildDayStat()]}
					viewedGroup={viewedGroup}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
			expect(document.querySelectorAll('tbody tr').length).toBe(
				speciesStats.length
			);
			expect(
				screen.queryByRole('link', { name: '16th August 2026' })
			).toBeNull();
		});

		it('renders a single session day', () => {
			render(
				<SpeciesTotalsSection
					speciesStats={speciesStats}
					sessionTotals={[buildDayStat({ time_period: '2026-08-16' })]}
					viewedGroup={viewedGroup}
				/>
			);
			expect(document.querySelectorAll('tbody tr').length).toBe(1);
			expect(
				screen
					.getByRole('link', { name: '16th August 2026' })
					.getAttribute('href')
			).toBe('/group/alpha/session-temp/2026-08-16');
		});

		it('renders the period table empty state when there were no sessions that month', () => {
			render(
				<SpeciesTotalsSection
					speciesStats={speciesStats}
					sessionTotals={[]}
					viewedGroup={viewedGroup}
				/>
			);
			expect(
				screen
					.getByRole('button', { name: 'Session totals' })
					.getAttribute('aria-current')
			).toBe('true');
			expect(screen.getByText('No data recorded.')).toBeTruthy();
		});
	});

	describe('when viewedGroup is undefined', () => {
		it('falls back to "Species totals" as the sole default tab, with no session links, even when sessionTotals are supplied', () => {
			render(
				<SpeciesTotalsSection
					speciesStats={speciesStats}
					sessionTotals={[buildDayStat()]}
					viewedGroup={undefined}
				/>
			);
			const tabs = screen.getAllByRole('button');
			expect(tabs.map((tab) => tab.textContent)).toEqual(['Species totals']);
			expect(
				screen.queryByRole('button', { name: 'Session totals' })
			).toBeNull();
			expect(
				screen.queryByRole('link', { name: '16th August 2026' })
			).toBeNull();
			expect(document.querySelectorAll('tbody tr').length).toBe(
				speciesStats.length
			);
		});
	});
});
