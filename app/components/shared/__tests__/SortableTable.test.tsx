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
});
