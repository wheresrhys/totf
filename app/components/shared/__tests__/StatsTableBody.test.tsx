import { describe, it, expect, afterEach } from 'vitest';
import {
	render,
	screen,
	cleanup,
	fireEvent,
	within
} from '@testing-library/react';
import { createStatsTableBody } from '../StatsTableBody';
import type { ColumnConfig, RowModelWithRawData } from '../SortableTable';

afterEach(() => {
	cleanup();
});

type Raw = { detail: string };
type Model = { name: string; count: number };
type Row = RowModelWithRawData<Raw, Model>;

const columnConfigs: Partial<Record<keyof Model, ColumnConfig>> = {
	name: { label: 'Name' },
	count: { label: 'Count', cellClassName: 'font-bold' }
};

function NameCell({ model }: { model: Row }) {
	return <span data-testid="name">{model.name}</span>;
}

function Detail({ model }: { model: Row }) {
	return <div data-testid="detail">{model._rawRowData.detail}</div>;
}

const makeRow = (name: string, count: number, detail: string): Row =>
	({ name, count, _rawRowData: { detail } }) as Row;

const rows = [
	makeRow('Robin', 3, 'robin-detail'),
	makeRow('Wren', 1, 'wren-detail')
];

// The factory returns a SortableTable TableBodyComponent (a <tbody>), so tests
// mount it inside a <table> to keep the DOM valid.
function renderBody(
	Body: ReturnType<typeof createStatsTableBody<Raw, Model>>,
	data: Row[]
) {
	return render(
		<table>
			<Body data={data} columnConfigs={columnConfigs} />
		</table>
	);
}

const flatBody = createStatsTableBody<Raw, Model>({
	FirstColumnComponent: NameCell,
	firstColumnKey: 'name',
	getKey: (model) => model.name
});

const accordionBody = createStatsTableBody<Raw, Model>({
	FirstColumnComponent: NameCell,
	firstColumnKey: 'name',
	getKey: (model) => model.name,
	ExpandedContentComponent: Detail
});

describe('createStatsTableBody', () => {
	describe('flat mode (no ExpandedContentComponent)', () => {
		it('renders one row per data item with no expand affordance', () => {
			renderBody(flatBody, rows);
			expect(screen.getAllByRole('row')).toHaveLength(2);
			expect(screen.queryByRole('button')).toBeNull();
		});

		it('renders the first-column cell and the remaining data columns', () => {
			renderBody(flatBody, rows);
			const robinRow = screen.getByText('Robin').closest('tr') as HTMLElement;
			expect(within(robinRow).getByTestId('name').textContent).toBe('Robin');
			// name is the first column; count is the sole remaining data column.
			expect(robinRow.textContent).toContain('3');
		});

		it('applies each column config cellClassName to its data cell', () => {
			renderBody(flatBody, rows);
			const robinRow = screen.getByText('Robin').closest('tr') as HTMLElement;
			const cells = within(robinRow).getAllByRole('cell');
			// [0] = first-column (name) cell, [1] = count cell.
			expect(cells[1].className).toContain('font-bold');
		});

		it('never renders the drill-down content', () => {
			renderBody(flatBody, rows);
			expect(screen.queryByTestId('detail')).toBeNull();
		});

		it('renders without crashing when given zero rows', () => {
			renderBody(flatBody, []);
			expect(screen.queryAllByRole('row')).toHaveLength(0);
			expect(screen.queryByRole('button')).toBeNull();
		});
	});

	describe('accordion mode (ExpandedContentComponent supplied)', () => {
		it('renders rows collapsed by default with an expand affordance per row', () => {
			renderBody(accordionBody, rows);
			// One data row per item, none expanded (no extra drill-down rows).
			expect(screen.getAllByRole('row')).toHaveLength(2);
			expect(screen.getAllByRole('button')).toHaveLength(2);
			expect(screen.queryByTestId('detail')).toBeNull();
		});

		it('expands a row on click to show its ExpandedContentComponent output', () => {
			renderBody(accordionBody, rows);
			const robinRow = screen.getByText('Robin').closest('tr') as HTMLElement;
			fireEvent.click(within(robinRow).getByRole('button'));
			expect(screen.getByTestId('detail').textContent).toBe('robin-detail');
		});

		it('collapses an expanded row when its toggle is clicked again', () => {
			renderBody(accordionBody, rows);
			const robinRow = screen.getByText('Robin').closest('tr') as HTMLElement;
			const toggle = within(robinRow).getByRole('button');
			fireEvent.click(toggle);
			expect(screen.getByTestId('detail')).not.toBeNull();
			fireEvent.click(toggle);
			expect(screen.queryByTestId('detail')).toBeNull();
		});

		it('switches the expansion to a different row when that row is clicked', () => {
			renderBody(accordionBody, rows);
			const robinRow = screen.getByText('Robin').closest('tr') as HTMLElement;
			const wrenRow = screen.getByText('Wren').closest('tr') as HTMLElement;
			fireEvent.click(within(robinRow).getByRole('button'));
			expect(screen.getByTestId('detail').textContent).toBe('robin-detail');
			fireEvent.click(within(wrenRow).getByRole('button'));
			const details = screen.getAllByTestId('detail');
			expect(details).toHaveLength(1);
			expect(details[0].textContent).toBe('wren-detail');
		});

		it('renders without crashing when given zero rows', () => {
			renderBody(accordionBody, []);
			expect(screen.queryAllByRole('row')).toHaveLength(0);
			expect(screen.queryByRole('button')).toBeNull();
		});
	});
});
