import { getAllByRole } from '@testing-library/react';
import { expect } from 'vitest';
export function verifyTableData(
	table: HTMLElement,
	data: string[][],
	{ isPartial = true }: { isPartial?: boolean } = { isPartial: true }
) {
	const [thead, tbody] = getAllByRole(table, 'rowgroup');
	const headers = getAllByRole(thead, 'columnheader');
	expect(headers).toHaveLength(data[0].length);
	data[0].map((header, index) => {
		expect(headers[index].textContent.trim()).toBe(header);
	});
	const rowEls = getAllByRole(tbody, 'row');
	if (isPartial) {
		expect(rowEls.length).toBeGreaterThanOrEqual(data.length - 1);
	} else {
		expect(rowEls).toHaveLength(data.length - 1);
	}
	data.slice(1).map((row, rowIndex) => {
		const rowEl = rowEls[rowIndex];
		const cells = getAllByRole(rowEl, 'cell');
		expect(cells).toHaveLength(row.length);
		row.map((cell, columnIndex) => {
			expect(
				cells[columnIndex].textContent.trim(),
				`Cell ${columnIndex + 1} in row ${rowIndex + 1} should be ${cell}`
			).toBe(String(cell));
		});
	});
}
