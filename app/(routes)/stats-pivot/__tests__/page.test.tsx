import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getCellByHeading } from '@/app/__tests__/helpers/table';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';
import { METRIC_COLOURS, PIVOT_METRICS } from '@/app/lib/stats-pivot';
import Page from '../page';

const { mockFetchStatsPivotRows } = vi.hoisted(() => ({
	mockFetchStatsPivotRows: vi.fn()
}));

vi.mock('@/app/actions/stats-pivot', () => ({
	fetchStatsPivotRows: mockFetchStatsPivotRows
}));

// Totals deliberately differ from the sum of the month cells: they come from
// their own cache grains, not from adding the grid up.
const sourceRows = {
	monthRows: [
		buildCoreStatsRow({
			time_period: '2025-03-01',
			bird_count: 40,
			encounter_count: 55
		}),
		buildCoreStatsRow({
			time_period: '2026-01-01',
			bird_count: 12,
			encounter_count: 20
		})
	],
	yearRows: [
		buildCoreStatsRow({ time_period: '2025-01-01', bird_count: 45 }),
		buildCoreStatsRow({ time_period: '2026-01-01', bird_count: 13 })
	],
	monthSquashedRows: [
		buildCoreStatsRow({ time_period: '0001-03-01', bird_count: 41 })
	],
	allTimeRows: [
		buildCoreStatsRow({ time_period: '0001-01-01', bird_count: 50 })
	]
};

async function renderStatsPivotPage() {
	render(await Page());
	await screen.findByTestId('stats-pivot-table');
}

function metricButton(label: string) {
	return screen.getByRole('button', { name: label });
}

function toggleMetric(label: string) {
	fireEvent.click(metricButton(label));
}

function march2025Cell() {
	return getCellByHeading('Mar', '2025');
}

beforeEach(() => {
	mockFetchStatsPivotRows.mockResolvedValue(sourceRows);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('metric selector', () => {
	it('renders a button per metric, none pressed', async () => {
		await renderStatsPivotPage();
		PIVOT_METRICS.forEach(({ label }) => {
			expect(metricButton(label).getAttribute('aria-pressed')).toBe('false');
		});
	});

	it('presses and colours a button on click, and unpresses it on a second click', async () => {
		await renderStatsPivotPage();
		toggleMetric('Birds');
		expect(metricButton('Birds').getAttribute('aria-pressed')).toBe('true');
		expect(metricButton('Birds').className).toContain(METRIC_COLOURS[0]);

		toggleMetric('Birds');
		expect(metricButton('Birds').getAttribute('aria-pressed')).toBe('false');
		expect(metricButton('Birds').className).not.toContain(METRIC_COLOURS[0]);
	});

	it('disables unselected buttons once every colour is in use', async () => {
		await renderStatsPivotPage();
		PIVOT_METRICS.slice(0, METRIC_COLOURS.length).forEach(({ label }) =>
			toggleMetric(label)
		);
		const firstUnselectedLabel = PIVOT_METRICS[METRIC_COLOURS.length].label;
		expect(metricButton(firstUnselectedLabel)).toHaveProperty('disabled', true);
	});
});

describe('pivot table', () => {
	it('renders a column per month and a row per year, latest first', async () => {
		await renderStatsPivotPage();
		const table = screen.getByRole('table');
		const headings = [...table.querySelectorAll('thead th')].map(
			(heading) => heading.textContent
		);
		expect(headings).toEqual([
			'Year',
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec',
			'Total'
		]);
		const years = [...table.querySelectorAll('tbody tr')].map(
			(row) => row.firstElementChild?.textContent
		);
		expect(years).toEqual(['2026', '2025', 'Total']);
	});

	it('shows a badge in the metric colour for each selected metric, separated by /', async () => {
		await renderStatsPivotPage();
		toggleMetric('Birds');
		toggleMetric('Encounters');
		expect(march2025Cell().textContent).toBe('40 / 55');
		const encountersBadge = march2025Cell().querySelector(
			'[data-testid="pivot-badge-encounter_count"]'
		)!;
		expect(encountersBadge.className).toContain(METRIC_COLOURS[1]);
	});

	it("keeps the second metric's colour after the first is deselected", async () => {
		await renderStatsPivotPage();
		toggleMetric('Birds');
		toggleMetric('Encounters');
		toggleMetric('Birds');
		expect(march2025Cell().textContent).toBe('55');
		expect(metricButton('Encounters').className).toContain(METRIC_COLOURS[1]);
	});

	it('renders at the extra-small size on every screen width', async () => {
		await renderStatsPivotPage();
		expect(screen.getByRole('table').className).toBe('table table-xs');
	});
});

describe('totals', () => {
	beforeEach(async () => {
		await renderStatsPivotPage();
		toggleMetric('Birds');
	});

	it("shows each year's year-grain value in the Total column", () => {
		expect(getCellByHeading('Total', '2025').textContent).toBe('45');
	});

	it('shows the month-squashed value in the Total row', () => {
		const totalsRow = screen.getByTestId('pivot-totals-row');
		expect(getCellByHeading('Mar', totalsRow).textContent).toBe('41');
	});

	it('shows the all-time value where the Total row and column meet', () => {
		const totalsRow = screen.getByTestId('pivot-totals-row');
		expect(getCellByHeading('Total', totalsRow).textContent).toBe('50');
	});
});
