import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SpeciesTotalsSection } from '../SpeciesTotalsSection';
import { buildMonthTotalsRows } from '@/app/models/month-totals';
import speciesDataSnapshot from '@/test-fixtures/snapshots/fetchSpeciesData.alpha.json';
import type { AggregateStatsResult } from '@/app/models/db';

const speciesStats = speciesDataSnapshot as unknown as AggregateStatsResult[];
const monthTotals = buildMonthTotalsRows(2026, []);

describe('SpeciesTotalsSection', () => {
	afterEach(() => {
		cleanup();
	});

	describe('without monthTotals (month/all-time pages)', () => {
		it('renders a single "Species totals" tab, active by default, with the table content visible beneath it', () => {
			render(<SpeciesTotalsSection speciesStats={speciesStats} />);
			const tab = screen.getByRole('button', { name: 'Species totals' });
			expect(tab.getAttribute('aria-current')).toBe('true');
			expect(screen.queryByRole('button', { name: 'Month totals' })).toBeNull();
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
	});

	describe('with monthTotals (year page)', () => {
		it('renders the "Month totals" tab first, active by default', () => {
			render(
				<SpeciesTotalsSection
					speciesStats={speciesStats}
					monthTotals={monthTotals}
				/>
			);
			const tabs = screen.getAllByRole('button');
			expect(tabs.map((tab) => tab.textContent)).toEqual([
				'Month totals',
				'Species totals'
			]);
			expect(tabs[0].getAttribute('aria-current')).toBe('true');
		});

		it('renders 12 month rows, each linking to /summary/{year}/{month}', () => {
			render(
				<SpeciesTotalsSection
					speciesStats={speciesStats}
					monthTotals={monthTotals}
				/>
			);
			expect(document.querySelectorAll('tbody tr').length).toBe(12);
			const januaryLink = screen.getByRole('link', { name: 'January 2026' });
			expect(januaryLink.getAttribute('href')).toBe('/summary/2026/1');
			const decemberLink = screen.getByRole('link', { name: 'December 2026' });
			expect(decemberLink.getAttribute('href')).toBe('/summary/2026/12');
		});

		it('switches to the species totals table when its tab is clicked', () => {
			render(
				<SpeciesTotalsSection
					speciesStats={speciesStats}
					monthTotals={monthTotals}
				/>
			);
			fireEvent.click(screen.getByRole('button', { name: 'Species totals' }));
			expect(screen.queryByRole('link', { name: 'January 2026' })).toBeNull();
			expect(document.querySelectorAll('tbody tr').length).toBe(
				speciesStats.length
			);
		});
	});
});
