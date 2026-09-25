import {
	getAllByRole,
	queryAllByRole,
	screen,
	within
} from '@testing-library/react';

/**
 * The real header <th>s live in the `<thead>` row without a `data-testid` —
 * `above-header-row` (the "Aggregate by" toggle row) and `totals-row` are
 * the other two possible `<thead>` rows, both explicitly testid'd, so this
 * excludes them rather than relying on the header row's fixed position.
 */
export function getColumnHeaders(): HTMLTableCellElement[] {
	const headerRow = Array.from(document.querySelectorAll('thead tr')).find(
		(row) => !row.hasAttribute('data-testid')
	);
	return Array.from(
		headerRow?.querySelectorAll('th') ?? []
	) as HTMLTableCellElement[];
}

/**
 * Index (0-based) of the column whose <th> text matches headingText.
 * container defaults to the sole table in the document (screen.getByRole('table')).
 */
export function getColumnIndex(headingText: string): number;
export function getColumnIndex(
	container: HTMLElement,
	headingText: string
): number;
export function getColumnIndex(
	containerOrHeadingText: HTMLElement | string,
	headingText?: string
): number {
	const [container, heading] =
		typeof containerOrHeadingText === 'string'
			? [screen.getByRole('table'), containerOrHeadingText]
			: [containerOrHeadingText, headingText as string];

	const [thead] = getAllByRole(container, 'rowgroup');
	const headers = getAllByRole(thead, 'columnheader');
	const index = headers.findIndex(
		(header) => header.textContent?.trim() === heading
	);
	if (index === -1) {
		throw new Error(`Column heading "${heading}" not found in table`);
	}
	return index;
}

/**
 * The <tr> whose text content includes rowText, scoped to container.
 * container defaults to the sole table in the document (screen.getByRole('table')).
 */
export function getRowByText(rowText: string): HTMLElement;
export function getRowByText(
	container: HTMLElement,
	rowText: string
): HTMLElement;
export function getRowByText(
	containerOrRowText: HTMLElement | string,
	rowText?: string
): HTMLElement {
	const [container, text] =
		typeof containerOrRowText === 'string'
			? [screen.getByRole('table'), containerOrRowText]
			: [containerOrRowText, rowText as string];

	const rows = queryAllByRole(container, 'row');
	const row = rows.find((candidate) => candidate.textContent?.includes(text));
	if (!row) {
		throw new Error(`Row containing "${text}" not found in table`);
	}
	return row;
}

/**
 * The cell under headingText, in the given row.
 * container defaults to the sole table in the document (screen.getByRole('table')).
 *
 * row may be:
 *   - a string       -> resolved via getRowByText(container, row)
 *   - a number       -> the nth (0-based) data row in <tbody>
 *   - an HTMLElement -> used directly (e.g. screen.getByTestId('totals-row'))
 */
export function getCellByHeading(
	headingText: string,
	row: number | string | Element
): HTMLElement;
export function getCellByHeading(
	container: HTMLElement,
	headingText: string,
	row: number | string | Element
): HTMLElement;
export function getCellByHeading(
	containerOrHeadingText: HTMLElement | string,
	headingTextOrRow: string | number | Element,
	maybeRow?: number | string | Element
): HTMLElement {
	const [container, headingText, row] =
		typeof containerOrHeadingText === 'string'
			? [screen.getByRole('table'), containerOrHeadingText, headingTextOrRow]
			: [
					containerOrHeadingText,
					headingTextOrRow as string,
					maybeRow as number | string | Element
				];

	const columnIndex = getColumnIndex(container, headingText);

	let rowEl: HTMLElement;
	if (typeof row === 'string') {
		rowEl = getRowByText(container, row);
	} else if (typeof row === 'number') {
		const [, tbody] = getAllByRole(container, 'rowgroup');
		const rows = getAllByRole(tbody, 'row');
		if (!rows[row]) {
			throw new Error(
				`Row index ${row} out of range — table has ${rows.length} data row(s)`
			);
		}
		rowEl = rows[row];
	} else {
		rowEl = row as HTMLElement;
	}

	const cells = within(rowEl).getAllByRole('cell');
	if (!cells[columnIndex]) {
		throw new Error(
			`No cell for column "${headingText}" (index ${columnIndex}) in the given row`
		);
	}
	return cells[columnIndex];
}

/**
 * Trimmed textContent of the cell under headingText, in the given row.
 * Same signature as getCellByHeading.
 */
export function getCellTextByHeading(
	headingText: string,
	row: number | string | Element
): string;
export function getCellTextByHeading(
	container: HTMLElement,
	headingText: string,
	row: number | string | Element
): string;
export function getCellTextByHeading(
	containerOrHeadingText: HTMLElement | string,
	headingTextOrRow: string | number | Element,
	maybeRow?: number | string | Element
): string {
	const cell =
		typeof containerOrHeadingText === 'string'
			? getCellByHeading(
					containerOrHeadingText,
					headingTextOrRow as number | string | Element
				)
			: getCellByHeading(
					containerOrHeadingText,
					headingTextOrRow as string,
					maybeRow as number | string | Element
				);
	return (cell.textContent ?? '').trim();
}
