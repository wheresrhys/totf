'use client';
import { Table } from '@/app/components/shared/DesignSystem';
import { useState } from 'react';

export type ColumnConfig = {
	label: string;
	invertSort?: boolean;
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

export function getFormattedValue<RowModel>(
	columnConfigs: Partial<Record<keyof RowModel, ColumnConfig>>
) {
	return (rawValue: unknown, property: keyof RowModel) => {
		const formatter = columnConfigs[property]?.formatter as (
			value: unknown
		) => string;
		return formatter ? formatter(rawValue) : (rawValue as string);
	};
}

type SortableTableProps<RawRowData, RowModel> = {
	// Partial: callers may omit a RowModel key entirely to hide that column
	// (e.g. the Pulli column when a session caught no pulli).
	columnConfigs: Partial<Record<keyof RowModel, ColumnConfig>>;
	data: RawRowData[];
	rowDataTransform: (modelData: RawRowData) => RowModel;
	testId?: string;
	initialSortColumn?: keyof RowModel;
	// Optional pinned row (typically built via `buildTotalsRowCells`) rendered
	// inside <thead>, immediately after the header row. Living in <thead> — not
	// <tbody> — keeps it structurally outside the sorted data, so no
	// sortColumn/sortDirection state can ever move or reorder it.
	totalsRow?: React.ReactNode;
	// Optional row rendered inside <thead>, immediately before the header row.
	// Every column outside the [spanFromColumn, spanToColumn] range (inclusive,
	// by position in orderedColumns) renders as an empty <th>; that whole range
	// collapses into a single <th colSpan={n}>{content}</th> at the position of
	// spanFromColumn. Knows nothing about what `content` is — a follow-up
	// consumer supplies the actual control and owns its state.
	aboveHeaderRow?: {
		spanFromColumn: keyof RowModel;
		spanToColumn: keyof RowModel;
		content: React.ReactNode;
	};
	TableBodyComponent: React.ComponentType<{
		data: RowModelWithRawData<RawRowData, RowModel>[];
		columnConfigs?: Partial<Record<keyof RowModel, ColumnConfig>>;
	}>;
};

export function SortableTable<RawRowData, RowModel>({
	columnConfigs,
	data,
	initialSortColumn,
	testId,
	totalsRow,
	aboveHeaderRow,
	rowDataTransform,
	TableBodyComponent
}: SortableTableProps<RawRowData, RowModel>) {
	const orderedColumns = Object.entries(columnConfigs).map(
		([property, columnConfig]) =>
			({ property, ...(columnConfig as object) }) as {
				property: keyof RowModel;
			} & ColumnConfig
	);
	const spanFromIndex = aboveHeaderRow
		? orderedColumns.findIndex(
				(column) => column.property === aboveHeaderRow.spanFromColumn
			)
		: -1;
	const spanToIndex = aboveHeaderRow
		? orderedColumns.findIndex(
				(column) => column.property === aboveHeaderRow.spanToColumn
			)
		: -1;

	const [sortColumn, setSortColumn] = useState<keyof RowModel | null>(
		initialSortColumn || null
	);
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
		initialSortColumn ? 'desc' : null
	);
	const [sortIsInverted, setSortIsInverted] = useState<boolean>(
		initialSortColumn
			? columnConfigs[initialSortColumn]?.invertSort || false
			: false
	);

	function handleColumnClick(property: keyof RowModel) {
		if (sortColumn === property) {
			setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
		} else {
			setSortColumn(property);
			// TODO hideously inefficient
			setSortIsInverted(columnConfigs[property]?.invertSort || false);
			setSortDirection('desc');
		}
	}

	let sortedData = data.map((rawRowData) => {
		const rowModel = rowDataTransform(rawRowData);
		return { ...rowModel, _rawRowData: rawRowData } as RowModelWithRawData<
			RawRowData,
			RowModel
		>;
	});
	if (sortColumn) {
		sortedData = sortedData.sort((a, b) => {
			const aValue = a[sortColumn as keyof RowModel];
			const bValue = b[sortColumn as keyof RowModel];
			let comparisonResult = 0;
			if (typeof aValue === 'string') {
				comparisonResult = aValue.localeCompare(bValue as string);
			} else {
				if (aValue == bValue) {
					comparisonResult = 0;
				} else {
					comparisonResult = (aValue as number) > (bValue as number) ? 1 : -1;
				}
			}
			return (
				comparisonResult *
				(sortDirection === 'asc' ? 1 : -1) *
				(sortIsInverted ? -1 : 1)
			);
		}) as RowModelWithRawData<RawRowData, RowModel>[];
	}

	return (
		<Table testId={testId}>
			<thead>
				{aboveHeaderRow ? (
					<tr data-testid="above-header-row">
						{orderedColumns.map((column, index) => {
							if (index === spanFromIndex) {
								return (
									<th
										key={column.property as string}
										colSpan={spanToIndex - spanFromIndex + 1}
									>
										{aboveHeaderRow.content}
									</th>
								);
							}
							if (index > spanFromIndex && index <= spanToIndex) {
								return null;
							}
							return <th key={column.property as string}></th>;
						})}
					</tr>
				) : null}
				<tr>
					{orderedColumns.map((column) => (
						<th
							className={`text-wrap cursor-pointer ${column.headerClassName ?? ''}`}
							key={column.property as string}
							onClick={() => handleColumnClick(column.property)}
						>
							<div className="flex items-center justify-between gap-1">
								{column.label}
								{sortColumn === column.property ? (
									<span
										className={`${sortDirection === 'asc' ? 'icon-[tabler--chevron-up]' : 'icon-[tabler--chevron-down]'} size-4`}
									></span>
								) : null}
							</div>
						</th>
					))}
				</tr>
				{totalsRow ? (
					<tr data-testid="totals-row" className="font-semibold">
						{totalsRow}
					</tr>
				) : null}
			</thead>
			<TableBodyComponent data={sortedData} columnConfigs={columnConfigs} />
		</Table>
	);
}
