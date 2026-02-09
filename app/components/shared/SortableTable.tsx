'use client';
import { Table } from '@/app/components/shared/DesignSystem';
import { useState } from 'react';

export type ColumnConfig = {
	label: string;
	invertSort?: boolean;
	formatter?: (value: unknown) => string;
};

export type RowModelWithRawData<RawRowData, RowModel> = RowModel & {
	_rawRowData: RawRowData;
};

export function getFormattedValue<RowModel>(
	columnConfigs: Record<keyof RowModel, ColumnConfig>
) {
	return (rawValue: unknown, property: keyof RowModel) => {
		const formatter = columnConfigs[property].formatter as (
			value: unknown
		) => string;
		return formatter ? formatter(rawValue) : (rawValue as string);
	};
}

type SortableTableProps<RawRowData, RowModel> = {
	columnConfigs: Record<keyof RowModel, ColumnConfig>;
	data: RawRowData[];
	rowDataTransform: (modelData: RawRowData) => RowModel;
	testId?: string;
	initialSortColumn?: keyof RowModel;
	TableBodyComponent: React.ComponentType<{
		data: RowModelWithRawData<RawRowData, RowModel>[];
	}>;
};

export function SortableTable<RawRowData, RowModel>({
	columnConfigs,
	data,
	initialSortColumn,
	testId,
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
			? columnConfigs[initialSortColumn].invertSort || false
			: false
	);

	function handleColumnClick(property: keyof RowModel) {
		if (sortColumn === property) {
			setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
		} else {
			setSortColumn(property);
			// TODO hideously inefficient
			setSortIsInverted(columnConfigs[property].invertSort || false);
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
				<tr>
					{orderedColumns.map((column) => (
						<th
							className="text-wrap cursor-pointer"
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
			</thead>
			<TableBodyComponent data={sortedData} />
		</Table>
	);
}
