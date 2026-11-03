'use client';
import { Table } from './DesignSystem';
import { useState } from 'react';
import type { ColumnConfig, RowModelWithRawData } from '../types';

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
	// Forwarded to the underlying <Table> so callers can override the default
	// responsive sizing (e.g. an always-compact `table table-xs`). Omitted →
	// Table falls back to `defaultTableClassName`.
	className?: string;
	initialSortColumn?: keyof RowModel;
	// Optional pinned row (typically built via `buildTotalsRowCells`) rendered
	// inside <thead>, immediately after the header row. Living in <thead> — not
	// <tbody> — keeps it structurally outside the sorted data, so no
	// sortColumn/sortDirection state can ever move or reorder it.
	totalsRow?: React.ReactNode;
	TableBodyComponent: React.ComponentType<{
		data: RowModelWithRawData<RawRowData, RowModel>[];
		columnConfigs?: Partial<Record<keyof RowModel, ColumnConfig>>;
	}>;
};

function ColumnHeader<RowModel>({
	column,
	onColumnClick,
	sortDirection
}: {
	column: {
		property: keyof RowModel;
	} & ColumnConfig;
	onColumnClick: (property: keyof RowModel) => void;
	sortDirection?: 'asc' | 'desc' | null;
}) {
	const [showTooltip, setShowTooltip] = useState(false);

	return (
		<th
			className={`text-wrap cursor-pointer ${column.headerClassName ?? ''}`}
			key={column.property as string}
			onClick={() => onColumnClick(column.property)}
		>
			<div className="flex items-center justify-between gap-1">
				{column.label}
				{column.tooltip ? (
					<div className={`tooltip ${showTooltip ? 'show' : ''}`}>
						<button
							type="button"
							className="tooltip-toggle align-super"
							aria-label="Tooltip"
							onMouseOver={() => setShowTooltip(true)}
							onMouseOut={() => setShowTooltip(false)}
						>
							<span className="icon-[tabler--info-circle] size-3"></span>
						</button>
						{showTooltip ? (
							<span
								className="tooltip-content tooltip-shown:opacity-100 tooltip-shown:visible max-w-2xs flex"
								role="tooltip"
							>
								<span className="p-2 bg-white border rounded-sm border-solid border-inherit normal-case font-normal text-xs">
									{column.tooltip}
								</span>
							</span>
						) : null}
					</div>
				) : null}
				{sortDirection ? (
					<span
						className={`${sortDirection === 'asc' ? 'icon-[tabler--chevron-up]' : 'icon-[tabler--chevron-down]'} size-4`}
					></span>
				) : null}
			</div>
		</th>
	);
}

export function SortableTable<RawRowData, RowModel>({
	columnConfigs,
	data,
	initialSortColumn,
	testId,
	className,
	totalsRow,
	rowDataTransform,
	TableBodyComponent
}: SortableTableProps<RawRowData, RowModel>) {
	const orderedColumns = Object.entries(columnConfigs).map(
		([property, columnConfig]) =>
			({ property, ...(columnConfig as object) }) as {
				property: keyof RowModel;
			} & ColumnConfig
	);

	const [sortColumn, setSortColumn] = useState<keyof RowModel | null>(
		initialSortColumn || null
	);
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
		initialSortColumn ? 'desc' : null
	);
	const [sortIsInverted, setSortIsInverted] = useState<boolean>(
		initialSortColumn
			? columnConfigs[initialSortColumn]?.preferSortAscending || false
			: false
	);

	function handleColumnClick(property: keyof RowModel) {
		if (sortColumn === property) {
			setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
		} else {
			setSortColumn(property);
			// TODO hideously inefficient
			setSortIsInverted(columnConfigs[property]?.preferSortAscending || false);
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
		<Table testId={testId} className={className}>
			<thead>
				<tr>
					{orderedColumns.map((column) => (
						<ColumnHeader<RowModel>
							key={column.property as string}
							column={column}
							onColumnClick={handleColumnClick}
							sortDirection={
								sortColumn === column.property ? sortDirection : null
							}
						/>
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
