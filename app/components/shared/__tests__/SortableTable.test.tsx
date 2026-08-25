import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SortableTable, type ColumnConfig } from '../SortableTable';

type Row = { name: string; count: number };

const columnConfigs: Record<keyof Row, ColumnConfig> = {
	name: { label: 'Name' },
	count: { label: 'Count' }
};

const data: Row[] = [
	{ name: 'Chiffchaff', count: 5 },
	{ name: 'Robin', count: 12 },
	{ name: 'Blue Tit', count: 3 }
];

import type { RowModelWithRawData } from '../SortableTable';

function SimpleBody({ data }: { data: RowModelWithRawData<Row, Row>[] }) {
	return (
		<tbody>
			{data.map((row) => (
				<tr key={row._rawRowData.name}>
					<td>{row._rawRowData.name}</td>
					<td>{row._rawRowData.count}</td>
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

	describe('per-column styling', () => {
		it("applies a column's headerClassName to its header", () => {
			const styledColumnConfigs: Record<keyof Row, ColumnConfig> = {
				name: { label: 'Name' },
				count: { label: 'Count', headerClassName: 'bg-green-50' }
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
