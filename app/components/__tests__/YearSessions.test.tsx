import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { YearSessions } from '../YearSessions';
import sessionsSnapshot from '@/test-fixtures/snapshots/tables/Sessions/alpha.all-sessions.json';
import type { SessionWithEncountersCount } from '@/app/models/session';

const allSessions = sessionsSnapshot as SessionWithEncountersCount[];

// Group 2022 sessions by month (4 months)
const sessions2022 = allSessions.filter((s) => s.visit_date.startsWith('2022'));
const yearData: SessionWithEncountersCount[][] = [
	sessions2022.filter((s) => s.visit_date.startsWith('2022-10')),
	sessions2022.filter((s) => s.visit_date.startsWith('2022-08')),
	sessions2022.filter((s) => s.visit_date.startsWith('2022-06')),
	sessions2022.filter((s) => s.visit_date.startsWith('2022-04'))
];

const mockOnToggle = vi.fn();

function renderYearSessions(
	overrides: Partial<{
		year: SessionWithEncountersCount[][];
		yearString: string;
		viewedGroup: { id: number; slug: string };
		expandedYear: string | false;
		onToggle: (id: string | false) => void;
	}> = {}
) {
	const props = {
		year: yearData,
		yearString: '2022',
		viewedGroup: { id: 1, slug: 'alpha' },
		expandedYear: false as string | false,
		onToggle: mockOnToggle,
		...overrides
	};
	return render(
		<YearSessions
			year={props.year}
			yearString={props.yearString}
			viewedGroup={props.viewedGroup}
			expandedYear={props.expandedYear}
			onToggle={props.onToggle}
		/>
	);
}

describe('YearSessions', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('renders the year heading', () => {
		renderYearSessions();
		const yearButton = document.getElementById('2022-header');
		expect(yearButton?.textContent).toContain('2022');
	});

	it('calls onToggle when year heading is clicked', () => {
		renderYearSessions();
		const yearButton = document.getElementById('2022-header') as HTMLElement;
		fireEvent.click(yearButton);
		expect(mockOnToggle).toHaveBeenCalledWith('2022');
	});

	it('renders month accordions when expanded', () => {
		renderYearSessions({ expandedYear: '2022' });
		const monthsContainer = screen.getByTestId('months-of-year');
		const monthButtons = monthsContainer.querySelectorAll('button');
		expect(monthButtons.length).toBe(4);
	});

	// This ticket (#490) flips the session hrefs threaded down the calendar
	// tree from viewedGroup.id to viewedGroup.slug, now that the
	// /group/[groupSlug] route accepts slugs.
	it('threads viewedGroup.slug into session hrefs', () => {
		renderYearSessions({ expandedYear: '2022' });
		const sessionLink = document.querySelector(
			'a[href="/group/alpha/session/2022-10-20"]'
		);
		expect(sessionLink).not.toBeNull();
		// No href in the tree leaks the numeric id.
		expect(document.querySelector('a[href*="/group/1/"]')).toBeNull();
	});
});
