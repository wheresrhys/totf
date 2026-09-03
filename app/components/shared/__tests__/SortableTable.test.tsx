import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SortableTable, type ColumnConfig } from '../SortableTable';

type Row = { name: string; count: number; species: string };

const columnConfigs: Record<keyof Row, ColumnConfig> = {
	name: { label: 'Name' },
	count: { label: 'Count' },
	species: { label: 'Species' }
};

const data: Row[] = [
	{ name: 'Chiffchaff', count: 5, species: 'Phylloscopus collybita' },
	{ name: 'Robin', count: 12, species: 'Erithacus rubecula' },
	{ name: 'Blue Tit', count: 3, species: 'Cyanistes caeruleus' }
];

const totalsCells = (
	<>
		<td>Total</td>
		<td>20</td>
		<td></td>
	</>
);

import type { RowModelWithRawData } from '../SortableTable';

function SimpleBody({ data }: { data: RowModelWithRawData<Row, Row>[] }) {
	return (
		<tbody>
			{data.map((row) => (
				<tr key={row._rawRowData.name}>
					<td>{row._rawRowData.name}</td>
					<td>{row._rawRowData.count}</td>
					<td>{row._rawRowData.species}</td>
				</tr>
			))}
		</tbody>
	);
}

describe('SortableTable', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders all column headers', () => {
		render(
			<SortableTable<Row, Row>
				columnConfigs={columnConfigs}
				data={data}
				rowDataTransform={(r) => r}
				TableBodyComponent={SimpleBody}
			/>
		);
		expect(screen.getByText('Name')).toBeDefined();
		expect(screen.getByText('Count')).toBeDefined();
	});

	it('renders compact on small screens and full size from sm: up, per issue #605', () => {
		render(
			<SortableTable<Row, Row>
				columnConfigs={columnConfigs}
				data={data}
				rowDataTransform={(r) => r}
				TableBodyComponent={SimpleBody}
			/>
		);
		const table = document.querySelector('table');
		expect(table?.className).toContain('table-xs');
		expect(table?.className).toContain('sm:table-md');
	});

	it('renders all data rows in original order by default', () => {
		render(
			<SortableTable<Row, Row>
				columnConfigs={columnConfigs}
				data={data}
				rowDataTransform={(r) => r}
				TableBodyComponent={SimpleBody}
			/>
		);
		const rows = document.querySelectorAll('tbody tr');
		expect(rows[0].textContent).toContain('Chiffchaff');
		expect(rows[1].textContent).toContain('Robin');
		expect(rows[2].textContent).toContain('Blue Tit');
	});

	it('sorts descending by column on first click', () => {
		render(
			<SortableTable<Row, Row>
				columnConfigs={columnConfigs}
				data={data}
				rowDataTransform={(r) => r}
				TableBodyComponent={SimpleBody}
			/>
		);
		fireEvent.click(screen.getByText('Count'));
		const rows = document.querySelectorAll('tbody tr');
		// descending: 12, 5, 3
		expect(rows[0].textContent).toContain('Robin');
		expect(rows[1].textContent).toContain('Chiffchaff');
		expect(rows[2].textContent).toContain('Blue Tit');
	});

	it('toggles to ascending sort on second click of same column', () => {
		render(
			<SortableTable<Row, Row>
				columnConfigs={columnConfigs}
				data={data}
				rowDataTransform={(r) => r}
				TableBodyComponent={SimpleBody}
			/>
		);
		fireEvent.click(screen.getByText('Count'));
		fireEvent.click(screen.getByText('Count'));
		const rows = document.querySelectorAll('tbody tr');
		// ascending: 3, 5, 12
		expect(rows[0].textContent).toContain('Blue Tit');
		expect(rows[1].textContent).toContain('Chiffchaff');
		expect(rows[2].textContent).toContain('Robin');
	});

	it('sorts by initialSortColumn descending on first render', () => {
		render(
			<SortableTable<Row, Row>
				columnConfigs={columnConfigs}
				data={data}
				rowDataTransform={(r) => r}
				initialSortColumn="count"
				TableBodyComponent={SimpleBody}
			/>
		);
		const rows = document.querySelectorAll('tbody tr');
		expect(rows[0].textContent).toContain('Robin');
	});

	describe('totalsRow', () => {
		it('renders the supplied totalsRow as an extra row inside <thead>', () => {
			render(
				<SortableTable<Row, Row>
					columnConfigs={columnConfigs}
					data={data}
					rowDataTransform={(r) => r}
					totalsRow={totalsCells}
					TableBodyComponent={SimpleBody}
				/>
			);
			const totalsRow = screen.getByTestId('totals-row');
			expect(totalsRow.closest('thead')).not.toBeNull();
			expect(totalsRow.closest('tbody')).toBeNull();
			expect(totalsRow.textContent).toContain('Total');
			expect(totalsRow.textContent).toContain('20');
		});

		it('renders the totals row immediately after the header row, before any tbody row', () => {
			render(
				<SortableTable<Row, Row>
					columnConfigs={columnConfigs}
					data={data}
					rowDataTransform={(r) => r}
					totalsRow={totalsCells}
					TableBodyComponent={SimpleBody}
				/>
			);
			const theadRows = document.querySelectorAll('thead tr');
			// header row first, totals row second
			expect(theadRows).toHaveLength(2);
			expect(theadRows[1].getAttribute('data-testid')).toBe('totals-row');
			// no tbody row precedes it
			const firstBodyRow = document.querySelector('tbody tr');
			expect(firstBodyRow?.textContent).toContain('Chiffchaff');
		});

		it('leaves the totals row position and content unchanged when sorting a data column (asc and desc)', () => {
			render(
				<SortableTable<Row, Row>
					columnConfigs={columnConfigs}
					data={data}
					rowDataTransform={(r) => r}
					totalsRow={totalsCells}
					TableBodyComponent={SimpleBody}
				/>
			);
			const readTotals = () => {
				const theadRows = document.querySelectorAll('thead tr');
				return {
					index: Array.from(theadRows).findIndex(
						(row) => row.getAttribute('data-testid') === 'totals-row'
					),
					content: screen.getByTestId('totals-row').textContent
				};
			};
			const before = readTotals();
			fireEvent.click(screen.getByText('Count')); // descending
			expect(readTotals()).toEqual(before);
			fireEvent.click(screen.getByText('Count')); // ascending
			expect(readTotals()).toEqual(before);
		});

		it('renders no extra <thead> row when totalsRow is omitted', () => {
			render(
				<SortableTable<Row, Row>
					columnConfigs={columnConfigs}
					data={data}
					rowDataTransform={(r) => r}
					TableBodyComponent={SimpleBody}
				/>
			);
			expect(screen.queryByTestId('totals-row')).toBeNull();
			expect(document.querySelectorAll('thead tr')).toHaveLength(1);
		});
	});

	describe('per-column styling', () => {
		it("applies a column's headerClassName to its header", () => {
			const styledColumnConfigs: Record<keyof Row, ColumnConfig> = {
				name: { label: 'Name' },
				count: { label: 'Count', headerClassName: 'bg-green-50' },
				species: { label: 'Species' }
			};
			render(
				<SortableTable<Row, Row>
					columnConfigs={styledColumnConfigs}
					data={data}
					rowDataTransform={(r) => r}
					TableBodyComponent={SimpleBody}
				/>
			);
			expect(screen.getByText('Count').closest('th')?.className).toContain(
				'bg-green-50'
			);
			expect(screen.getByText('Name').closest('th')?.className).not.toContain(
				'bg-green-50'
			);
		});

		it('omits a RowModel key from columnConfigs to hide its column entirely', () => {
			const partialColumnConfigs: Partial<Record<keyof Row, ColumnConfig>> = {
				name: { label: 'Name' }
			};
			render(
				<SortableTable<Row, Row>
					columnConfigs={partialColumnConfigs}
					data={data}
					rowDataTransform={(r) => r}
					TableBodyComponent={SimpleBody}
				/>
			);
			expect(screen.queryByText('Count')).toBeNull();
		});

		it('passes columnConfigs through to TableBodyComponent so it can look up per-column cell styling', () => {
			let receivedColumnConfigs: unknown;
			function CapturingBody({
				data,
				columnConfigs: bodyColumnConfigs
			}: {
				data: RowModelWithRawData<Row, Row>[];
				columnConfigs?: Partial<Record<keyof Row, ColumnConfig>>;
			}) {
				receivedColumnConfigs = bodyColumnConfigs;
				return <SimpleBody data={data} />;
			}
			render(
				<SortableTable<Row, Row>
					columnConfigs={columnConfigs}
					data={data}
					rowDataTransform={(r) => r}
					TableBodyComponent={CapturingBody}
				/>
			);
			expect(receivedColumnConfigs).toBe(columnConfigs);
		});
	});
});
