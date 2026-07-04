import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { YearSessions } from '../YearSessions';
import sessionsSnapshot from '@/test-fixtures/snapshots/fetchAllSessions.alpha.json';
import type { SessionWithEncountersCount } from '@/app/models/session';

const allSessions = sessionsSnapshot as unknown as SessionWithEncountersCount[];

// Group 2022 sessions by month (4 months)
const sessions2022 = allSessions.filter((s) => s.visit_date.startsWith('2022'));
const yearData: SessionWithEncountersCount[][] = [
	sessions2022.filter((s) => s.visit_date.startsWith('2022-10')),
	sessions2022.filter((s) => s.visit_date.startsWith('2022-08')),
	sessions2022.filter((s) => s.visit_date.startsWith('2022-06')),
	sessions2022.filter((s) => s.visit_date.startsWith('2022-04'))
];

const mockOnToggle = vi.fn();

describe('YearSessions', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('renders the year heading', () => {
		render(
			<YearSessions
				year={yearData}
				yearString="2022"
				viewedGroupId={1}
				expandedYear={false}
				onToggle={mockOnToggle}
			/>
		);
		const yearButton = document.getElementById('2022-header');
		expect(yearButton?.textContent).toContain('2022');
	});

	it('calls onToggle when year heading is clicked', () => {
		render(
			<YearSessions
				year={yearData}
				yearString="2022"
				viewedGroupId={1}
				expandedYear={false}
				onToggle={mockOnToggle}
			/>
		);
		const yearButton = document.getElementById('2022-header') as HTMLElement;
		fireEvent.click(yearButton);
		expect(mockOnToggle).toHaveBeenCalledWith('2022');
	});

	it('renders month accordions when expanded', () => {
		render(
			<YearSessions
				year={yearData}
				yearString="2022"
				viewedGroupId={1}
				expandedYear="2022"
				onToggle={mockOnToggle}
			/>
		);
		const monthsContainer = screen.getByTestId('months-of-year');
		const monthButtons = monthsContainer.querySelectorAll('button');
		expect(monthButtons.length).toBe(4);
	});
});
