// Types shared across more than one file in this module. Owned here per root
// CLAUDE.md's "Module conventions" — `ColumnConfig`/`RowModelWithRawData` used
// to live in `SortableTable.tsx` and be imported file-to-file from there by
// `StatsTableBody.tsx` and `StatsTableColumnConfigs.tsx`; they live here
// instead so neither of those two imports the other's sibling directly.

export type ColumnConfig = {
	label: string;
	tooltip?: string;
	preferSortAscending?: boolean;
	formatter?: (value: unknown) => string;
	// Applied to the column's <th>, letting callers group/emphasise columns
	// (background colour, thicker borders, etc.) via the same config object
	// used to describe the column, rather than a parallel styling mechanism.
	headerClassName?: string;
	// Applied to each <td> a TableBodyComponent renders for this column (the
	// component receives columnConfigs alongside data so it can look this up).
	cellClassName?: string;
};

export type RowModelWithRawData<RawRowData, RowModel> = RowModel & {
	_rawRowData: RawRowData;
};
