import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
	TemporalFilterControls,
	type TemporalNavigationTarget
} from '../TemporalFilterControls';
import type { TemporalSelection } from '@/app/lib/temporal-filter';

// Local override of the global next/navigation mock (vitest.setup.tsx) so the
// push calls this component makes can be asserted on directly.
const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock('next/navigation', () => ({
	useRouter: () => ({
		push: mockPush,
		replace: vi.fn(),
		refresh: vi.fn(),
		back: vi.fn(),
		forward: vi.fn(),
		prefetch: vi.fn()
	})
}));

const years = [2021, 2022, 2023];

function renderControls({
	baseUrl = '/species',
	initialSelection,
	navigationController
}: {
	baseUrl?: string;
	initialSelection?: TemporalSelection;
	navigationController?: (
		selected: TemporalSelection
	) => TemporalNavigationTarget;
} = {}) {
	render(
		<TemporalFilterControls
			years={years}
			baseUrl={baseUrl}
			initialSelection={initialSelection}
			navigationController={navigationController}
		/>
	);
}

function selectYear(year: number | '') {
	fireEvent.change(screen.getByLabelText('Year'), {
		target: { value: String(year) }
	});
}

function selectMonth(month: number | '') {
	fireEvent.change(screen.getByLabelText('Month'), {
		target: { value: String(month) }
	});
}

function setFromDate(date: string) {
	fireEvent.change(screen.getByLabelText('From date'), {
		target: { value: date }
	});
}

function setToDate(date: string) {
	fireEvent.change(screen.getByLabelText('To date'), {
		target: { value: date }
	});
}

function getInput(label: string) {
	return screen.getByLabelText(label) as HTMLInputElement;
}

function getSelect(label: string) {
	return screen.getByLabelText(label) as HTMLSelectElement;
}

function getEffectiveDateRange() {
	return screen.getByTestId('effective-date-range').textContent;
}

function openWarning() {
	fireEvent.click(
		screen.getByRole('button', { name: 'Date filter conflict warning' })
	);
}

function queryWarningIcon() {
	return screen.queryByRole('button', {
		name: 'Date filter conflict warning'
	});
}

function lastPushedHref() {
	return mockPush.mock.calls.at(-1)?.[0];
}

describe('TemporalFilterControls', () => {
	afterEach(cleanup);
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering controls', () => {
		it('renders year options from the `years` prop plus an "All" option', () => {
			renderControls();

			const options = Array.from(
				screen.getByLabelText('Year').querySelectorAll('option')
			).map((option) => option.textContent);

			expect(options).toEqual(['All', '2021', '2022', '2023']);
		});

		it('renders month options Jan–Dec plus an "All" option', () => {
			renderControls();

			const options = Array.from(
				screen.getByLabelText('Month').querySelectorAll('option')
			).map((option) => option.textContent);

			expect(options).toEqual([
				'All',
				'January',
				'February',
				'March',
				'April',
				'May',
				'June',
				'July',
				'August',
				'September',
				'October',
				'November',
				'December'
			]);
		});

		it('renders `fromDate` and `toDate` date inputs', () => {
			renderControls();

			expect(getInput('From date').type).toBe('date');
			expect(getInput('To date').type).toBe('date');
		});
	});

	describe('computing the effective date range', () => {
		it('uses the year-derived range when only year is selected', () => {
			renderControls();

			selectYear(2022);

			expect(getEffectiveDateRange()).toBe('Showing: 2022-01-01 to 2022-12-31');
		});

		it('uses the year-and-month-derived range when both year and month are selected', () => {
			renderControls();

			selectYear(2022);
			selectMonth(2);

			expect(getEffectiveDateRange()).toBe('Showing: 2022-02-01 to 2022-02-28');
		});

		it('uses the explicit fromDate/toDate when only those are set', () => {
			renderControls();

			setFromDate('2022-03-15');
			setToDate('2022-09-20');

			expect(getEffectiveDateRange()).toBe('Showing: 2022-03-15 to 2022-09-20');
		});

		it('intersects the year/month-derived range with fromDate/toDate when both are set', () => {
			renderControls();

			selectYear(2022);
			setFromDate('2022-03-15');
			setToDate('2023-09-20');

			// The later `from` (explicit) and the earlier `to` (year-derived) win.
			expect(getEffectiveDateRange()).toBe('Showing: 2022-03-15 to 2022-12-31');
		});

		it('names the recurring month when a month is selected without a year', () => {
			renderControls();

			selectMonth(5);

			expect(getEffectiveDateRange()).toBe('Showing: May in every year');
		});

		it('describes a yearless month plus a multi-year date range as a recurrence within those bounds, not one contiguous range', () => {
			renderControls();

			selectMonth(5);
			setFromDate('2021-01-01');
			setToDate('2023-12-31');

			expect(getEffectiveDateRange()).toBe(
				'Showing: May in every year, 2021-01-01 to 2023-12-31'
			);
		});

		it('describes a yearless month with only one bound set as a recurrence from that bound on', () => {
			renderControls();

			selectMonth(5);
			setFromDate('2021-01-01');

			expect(getEffectiveDateRange()).toBe(
				'Showing: May in every year, 2021-01-01 onwards'
			);
		});
	});

	describe('conflict warning', () => {
		it('shows no warning when only year/month is set', () => {
			renderControls();

			selectYear(2022);
			selectMonth(2);

			expect(queryWarningIcon()).toBeNull();
		});

		it('shows no warning when only fromDate/toDate is set', () => {
			renderControls();

			setFromDate('2022-03-15');
			setToDate('2022-09-20');

			expect(queryWarningIcon()).toBeNull();
		});

		it('shows a warning icon with a tooltip when year/month and fromDate/toDate are both set', () => {
			renderControls();

			selectYear(2022);
			setFromDate('2022-03-15');

			expect(queryWarningIcon()).not.toBeNull();
			openWarning();
			expect(screen.getByRole('tooltip').textContent).toMatch(
				/may not line up/i
			);
		});

		it('the "clear date range" action removes fromDate/toDate and the warning', () => {
			renderControls();

			selectYear(2022);
			setFromDate('2022-03-15');
			setToDate('2022-09-20');
			openWarning();
			fireEvent.click(screen.getByRole('button', { name: 'Clear date range' }));

			expect(getInput('From date').value).toBe('');
			expect(getInput('To date').value).toBe('');
			expect(getSelect('Year').value).toBe('2022');
			expect(queryWarningIcon()).toBeNull();
		});

		it('the "clear year/month" action removes year/month and the warning', () => {
			renderControls();

			selectYear(2022);
			selectMonth(2);
			setFromDate('2022-03-15');
			openWarning();
			fireEvent.click(screen.getByRole('button', { name: 'Clear year/month' }));

			expect(getSelect('Year').value).toBe('');
			expect(getSelect('Month').value).toBe('');
			expect(getInput('From date').value).toBe('2022-03-15');
			expect(queryWarningIcon()).toBeNull();
		});
	});

	describe('default navigation', () => {
		it('navigates to `baseUrl` with query string params for the selected temporal fields', () => {
			renderControls({ baseUrl: '/species' });

			selectYear(2022);
			selectMonth(2);
			setFromDate('2022-02-10');
			setToDate('2022-02-20');

			expect(lastPushedHref()).toBe(
				'/species?year=2022&month=2&fromDate=2022-02-10&toDate=2022-02-20'
			);
		});

		it('omits query string params for fields left unset', () => {
			renderControls({ baseUrl: '/species' });

			selectYear(2022);

			expect(lastPushedHref()).toBe('/species?year=2022');
		});
	});

	describe('navigationController override', () => {
		it('calls `navigationController` with the current selection', () => {
			const navigationController = vi.fn().mockReturnValue({
				path: '/summary/2022',
				queryStrings: {}
			});
			renderControls({ navigationController });

			selectYear(2022);
			setFromDate('2022-03-15');

			expect(navigationController).toHaveBeenLastCalledWith({
				year: 2022,
				fromDate: '2022-03-15'
			});
		});

		it('navigates to the path and query strings `navigationController` returns, instead of the default', () => {
			const navigationController = vi.fn().mockReturnValue({
				path: '/summary/2022/feb',
				queryStrings: { fromDate: '2022-02-10' }
			});
			renderControls({ baseUrl: '/species', navigationController });

			selectYear(2022);

			expect(lastPushedHref()).toBe('/summary/2022/feb?fromDate=2022-02-10');
		});
	});
});
