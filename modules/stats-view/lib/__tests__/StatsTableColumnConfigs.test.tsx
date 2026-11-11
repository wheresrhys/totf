import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
	createNameLinkCell,
	buildStandardColumnConfigs,
	buildBiometricColumnConfigs,
	buildTotalsRowCells,
	columnBlock
} from '../StatsTableColumnConfigs';
import { BiometricStatNames } from '@/modules/stats/browser';
import type { ColumnConfig, RowModelWithRawData } from '@/modules/ui-kit';

afterEach(() => {
	cleanup();
});

describe('createNameLinkCell', () => {
	type Raw = { label: string };
	type Model = { name: string };
	type Row = RowModelWithRawData<Raw, Model>;

	const makeRow = (name: string): Row =>
		({ name, _rawRowData: { label: name } }) as Row;

	it('renders the row display name as link text using the supplied getName', () => {
		const Cell = createNameLinkCell<Raw, Model>(
			(model) => model.name,
			() => '/anywhere'
		);
		render(<Cell model={makeRow('Robin')} />);
		expect(screen.getByRole('link').textContent?.trim()).toBe('Robin');
	});

	it('builds the href using the supplied buildHref, not a hardcoded /species/ path', () => {
		const Cell = createNameLinkCell<Raw, Model>(
			(model) => model.name,
			(model) => `/summary/${model.name}`
		);
		render(<Cell model={makeRow('2024')} />);
		expect(screen.getByRole('link').getAttribute('href')).toBe('/summary/2024');
	});

	it('re-derives name and href per row across rows with different values', () => {
		const Cell = createNameLinkCell<Raw, Model>(
			(model) => model.name,
			(model) => `/summary/${model.name}`
		);
		render(
			<>
				<Cell model={makeRow('January')} />
				<Cell model={makeRow('February')} />
			</>
		);
		const links = screen.getAllByRole('link');
		expect(links.map((link) => link.textContent?.trim())).toEqual([
			'January',
			'February'
		]);
		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			'/summary/January',
			'/summary/February'
		]);
	});

	it('does not break the href when the name contains characters needing URL-encoding', () => {
		const Cell = createNameLinkCell<Raw, Model>(
			(model) => model.name,
			(model) => `/species/${encodeURIComponent(model.name)}`
		);
		render(<Cell model={makeRow('Reed & Sedge')} />);
		expect(screen.getByRole('link').getAttribute('href')).toBe(
			'/species/Reed%20%26%20Sedge'
		);
	});

	it('renders the name as plain text (no link) when buildHref returns an empty string', () => {
		const Cell = createNameLinkCell<Raw, Model>(
			(model) => model.name,
			() => ''
		);
		render(<Cell model={makeRow('January')} />);
		expect(screen.queryByRole('link')).toBeNull();
		expect(screen.getByText('January').tagName).toBe('SPAN');
	});
});

describe('columnBlock', () => {
	it('applies the light-mode -50 tint and the dark-mode -950 tint from the same base colour', () => {
		const block = columnBlock('green');
		expect(block.headerClassName).toBe('bg-green-50 dark:bg-green-950');
		expect(block.cellClassName).toBe('bg-green-50 dark:bg-green-950');
	});

	it('applies the same tinted classes to both the header and every cell in the column', () => {
		const block = columnBlock('amber');
		expect(block.headerClassName).toBe(block.cellClassName);
	});

	it('appends extraClassName after the tint classes when supplied', () => {
		const block = columnBlock('cyan', 'border-l-4 border-l-base-content/30');
		expect(block.headerClassName).toBe(
			'bg-cyan-50 dark:bg-cyan-950 border-l-4 border-l-base-content/30'
		);
	});

	it('omits any trailing whitespace when extraClassName is not supplied', () => {
		const block = columnBlock('purple');
		expect(block.headerClassName).toBe('bg-purple-50 dark:bg-purple-950');
		expect(block.headerClassName?.endsWith(' ')).toBe(false);
	});
});

describe('buildStandardColumnConfigs', () => {
	// The session table's own RowModel shape, used to prove the builder
	// reproduces today's behaviour.
	type SessionModel = {
		new: number;
		retraps: number;
		pullus: number;
		juvs: number;
		postjuv: number;
		adults: number;
		unknownAge: number;
	};

	it('returns age counts in logical order when hasPulli is false', () => {
		const configs = buildStandardColumnConfigs<SessionModel>(false);
		expect(Object.keys(configs)).toEqual([
			'new',
			'retraps',
			'juvs',
			'postjuv',
			'adults',
			'unknownAge'
		]);
	});

	it('inserts the pullus entry immediately before juvs when hasPulli is true', () => {
		const configs = buildStandardColumnConfigs<SessionModel>(true);
		expect(Object.keys(configs)).toEqual([
			'new',
			'retraps',
			'pullus',
			'juvs',
			'postjuv',
			'adults',
			'unknownAge'
		]);
	});

	it('uses the correct label for each column', () => {
		const configs = buildStandardColumnConfigs<SessionModel>(true);
		expect(configs.new?.label).toBe('New');
		expect(configs.retraps?.label).toBe('Retrap');
		expect(configs.pullus?.label).toBe('Pulli');
		expect(configs.juvs?.label).toBe('Juv');
		expect(configs.unknownAge?.label).toBe('Not aged');
	});

	it('puts the start border on pullus when shown, on juvs when hidden, and the end border always on unknownAge', () => {
		const withPullus = buildStandardColumnConfigs<SessionModel>(true);
		expect(withPullus.pullus?.headerClassName).toContain('border-l-4');
		expect(withPullus.juvs?.headerClassName).not.toContain('border-l-4');
		expect(withPullus.unknownAge?.headerClassName).toContain('border-r-4');

		const withoutPullus = buildStandardColumnConfigs<SessionModel>(false);
		expect(withoutPullus.juvs?.headerClassName).toContain('border-l-4');
		expect(withoutPullus.unknownAge?.headerClassName).toContain('border-r-4');
	});

	it('omits the pullus key entirely (not an empty column) when hasPulli is false', () => {
		const configs = buildStandardColumnConfigs<SessionModel>(false);
		expect('pullus' in configs).toBe(false);
	});
});

describe('buildTotalsRowCells', () => {
	type TotalsModel = {
		speciesName: string;
		encounterCount: number;
		individualsCount: number;
	};
	const columnConfigs: Partial<Record<keyof TotalsModel, ColumnConfig>> = {
		speciesName: { label: 'Species' },
		encounterCount: { label: 'Encounters' },
		individualsCount: { label: 'Individuals', ...columnBlock('green') }
	};
	const totalsRowModel: TotalsModel = {
		speciesName: 'ignored',
		encounterCount: 42,
		individualsCount: 30
	};

	// buildTotalsRowCells returns a bare <td> array; render it inside a
	// table row so the DOM is valid and queryable.
	const renderCells = (cells: React.ReactNode[]) =>
		render(
			<table>
				<tbody>
					<tr>{cells}</tr>
				</tbody>
			</table>
		);

	it('renders one cell per columnConfigs entry, in the same order as the header', () => {
		const cells = buildTotalsRowCells<TotalsModel>({
			columnConfigs,
			totalsRowModel
		});
		renderCells(cells);
		const renderedCells = document.querySelectorAll('td');
		expect(renderedCells).toHaveLength(3);
		expect(renderedCells[0].textContent).toBe('Total');
		expect(renderedCells[1].textContent).toBe('42');
		expect(renderedCells[2].textContent).toBe('30');
	});

	it("renders the hard-coded 'Total' label as plain text in the first column, not a link", () => {
		const cells = buildTotalsRowCells<TotalsModel>({
			columnConfigs,
			totalsRowModel
		});
		renderCells(cells);
		expect(screen.getByText('Total')).toBeDefined();
		expect(screen.queryByRole('link')).toBeNull();
	});

	it('renders each non-first column value straight from totalsRowModel', () => {
		const cells = buildTotalsRowCells<TotalsModel>({
			columnConfigs,
			totalsRowModel
		});
		renderCells(cells);
		const renderedCells = document.querySelectorAll('td');
		// The first column ignores the model value in favour of the label.
		expect(renderedCells[0].textContent).not.toContain('ignored');
		expect(renderedCells[1].textContent).toBe('42');
		expect(renderedCells[2].textContent).toBe('30');
	});

	it('sums each non-first column across rowModels when no totalsRowModel is given', () => {
		const rowModels: TotalsModel[] = [
			{ speciesName: 'Robin', encounterCount: 10, individualsCount: 7 },
			{ speciesName: 'Wren', encounterCount: 20, individualsCount: 15 },
			{ speciesName: 'Dunnock', encounterCount: 12, individualsCount: 8 }
		];
		const cells = buildTotalsRowCells<TotalsModel>({
			columnConfigs,
			rowModels
		});
		renderCells(cells);
		const renderedCells = document.querySelectorAll('td');
		expect(renderedCells[0].textContent).toBe('Total');
		expect(renderedCells[1].textContent).toBe('42');
		expect(renderedCells[2].textContent).toBe('30');
	});

	it("carries each non-first column's cellClassName onto its cell", () => {
		const cells = buildTotalsRowCells<TotalsModel>({
			columnConfigs,
			totalsRowModel
		});
		renderCells(cells);
		const renderedCells = document.querySelectorAll('td');
		expect(renderedCells[2].className).toContain('bg-green-50');
	});

	it('returns no cells when columnConfigs is empty', () => {
		const cells = buildTotalsRowCells<TotalsModel>({
			columnConfigs: {},
			totalsRowModel
		});
		expect(cells).toHaveLength(0);
	});
});

describe('buildBiometricColumnConfigs', () => {
	describe('column set', () => {
		it('returns one ColumnConfig for each of the 8 BiometricStatName values', () => {
			const configs = buildBiometricColumnConfigs();
			expect(Object.keys(configs)).toEqual([...BiometricStatNames]);
		});

		it('labels each column with its stat name, Max/Avg/Min/Median phrasing and unit, e.g. "Max weight (g)" / "Median wing (mm)"', () => {
			const configs = buildBiometricColumnConfigs();
			expect(configs.max_weight?.label).toBe('Max weight (g)');
			expect(configs.avg_weight?.label).toBe('Avg weight (g)');
			expect(configs.min_weight?.label).toBe('Min weight (g)');
			expect(configs.median_weight?.label).toBe('Median weight (g)');
			expect(configs.max_wing?.label).toBe('Max wing (mm)');
			expect(configs.avg_wing?.label).toBe('Avg wing (mm)');
			expect(configs.min_wing?.label).toBe('Min wing (mm)');
			expect(configs.median_wing?.label).toBe('Median wing (mm)');
		});
	});

	describe('value formatting', () => {
		const format = (value: unknown) =>
			buildBiometricColumnConfigs().max_weight?.formatter?.(value);

		it('formats a numeric value to 1 decimal place', () => {
			expect(format(21.37)).toBe('21.4');
		});

		it('renders a null value as an em dash', () => {
			expect(format(null)).toBe('—');
		});

		it('renders a non-numeric value as an em dash', () => {
			expect(format('not a number')).toBe('—');
		});
	});
});
