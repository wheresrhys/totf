import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getCellByHeading } from '@/app/__tests__/helpers/table';
import { buildCoreStatsRow } from '@/app/__tests__/helpers/core-stats-fixtures';
import {
	METRIC_COLOURS,
	PIVOT_METRICS,
	type StatsPivotSearchParams
} from '@/app/lib/stats-pivot';
import Page from '../page';

const {
	mockFetchStatsPivotRows,
	mockFetchSpeciesComparisonStats,
	mockRouterReplace
} = vi.hoisted(() => ({
	mockFetchStatsPivotRows: vi.fn(),
	mockFetchSpeciesComparisonStats: vi.fn(),
	mockRouterReplace: vi.fn()
}));

vi.mock('@/app/actions/stats-pivot', () => ({
	fetchStatsPivotRows: mockFetchStatsPivotRows
}));

vi.mock('@/app/actions/compare-species', () => ({
	fetchSpeciesComparisonStats: mockFetchSpeciesComparisonStats
}));

vi.mock('next/navigation', () => ({
	usePathname: () => '/stats-pivot',
	useRouter: () => ({ replace: mockRouterReplace })
}));

const AVAILABLE_SPECIES = ['Robin', 'Wren'];

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

async function renderStatsPivotPage(searchParams: StatsPivotSearchParams = {}) {
	render(await Page({ searchParams: Promise.resolve(searchParams) }));
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
	mockFetchSpeciesComparisonStats.mockResolvedValue(
		AVAILABLE_SPECIES.map((speciesName) => ({ species_name: speciesName }))
	);
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

function speciesSelect() {
	return screen.getByRole<HTMLSelectElement>('combobox', {
		name: 'Filter by species'
	});
}

describe('prepopulating from the URL', () => {
	it('selects ?stats= metrics, coloured in listed order', async () => {
		await renderStatsPivotPage({ stats: ['encounter_count', 'bird_count'] });
		expect(metricButton('Encounters').className).toContain(METRIC_COLOURS[0]);
		expect(metricButton('Birds').className).toContain(METRIC_COLOURS[1]);
	});

	it("shows ?species= in the select and fetches that species' rows", async () => {
		await renderStatsPivotPage({ species: 'Wren' });
		expect(speciesSelect().value).toBe('Wren');
		expect(mockFetchStatsPivotRows).toHaveBeenCalledWith(
			expect.anything(),
			'Wren'
		);
	});

	it('falls back to all species for a species the group has no data for', async () => {
		await renderStatsPivotPage({ species: 'Dodo' });
		expect(speciesSelect().value).toBe('');
		expect(mockFetchStatsPivotRows).toHaveBeenCalledWith(
			expect.anything(),
			null
		);
	});
});

describe('species filter', () => {
	it('offers all species followed by each species', async () => {
		await renderStatsPivotPage();
		const optionLabels = [...speciesSelect().options].map(
			(option) => option.textContent
		);
		expect(optionLabels).toEqual(['All species', ...AVAILABLE_SPECIES]);
	});

	it('navigates to the chosen species, keeping the selected stats', async () => {
		await renderStatsPivotPage({ stats: 'bird_count' });
		fireEvent.change(speciesSelect(), { target: { value: 'Wren' } });
		expect(mockRouterReplace).toHaveBeenCalledWith(
			'/stats-pivot?species=Wren&stats=bird_count'
		);
	});

	it('drops ?species= when all species is chosen', async () => {
		await renderStatsPivotPage({ species: 'Wren' });
		fireEvent.change(speciesSelect(), { target: { value: '' } });
		expect(mockRouterReplace).toHaveBeenCalledWith('/stats-pivot');
	});
});

describe('mirroring the metric selection onto the URL', () => {
	it('writes the selection to ?stats= without navigating', async () => {
		const replaceState = vi.spyOn(window.history, 'replaceState');
		await renderStatsPivotPage({ species: 'Wren' });
		toggleMetric('Birds');
		expect(replaceState).toHaveBeenLastCalledWith(
			null,
			'',
			'/stats-pivot?species=Wren&stats=bird_count'
		);
		expect(mockRouterReplace).not.toHaveBeenCalled();
		replaceState.mockRestore();
	});
});
