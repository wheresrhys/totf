import { type ColumnConfig, type RowModelWithRawData } from './SortableTable';
import { AccordionTableBody } from './AccordionTableBody';

// A component rendering a single row's model — used for the first-column cell
// and (optionally) the expandable drill-down content.
type StatsTableRowComponent<RawRowData, RowModel> = React.ComponentType<{
	model: RowModelWithRawData<RawRowData, RowModel>;
}>;

export type StatsTableBodyConfig<RawRowData, RowModel> = {
	// Renders the first column's cell (typically a name link). In accordion mode
	// it sits alongside the expand-toggle button; in flat mode it fills a plain
	// first <td>.
	FirstColumnComponent: StatsTableRowComponent<RawRowData, RowModel>;
	// The RowModel key that `FirstColumnComponent` renders, so it is excluded
	// from the remaining data columns rather than being rendered twice.
	firstColumnKey: keyof RowModel;
	// Stable per-row key.
	getKey: (model: RowModelWithRawData<RawRowData, RowModel>) => string;
	// Optional drill-down content. Supplied → each row gets an expand/collapse
	// affordance (chevron button) and renders through `AccordionTableBody`.
	// Omitted → rows render flat with no expand affordance and no
	// `AccordionTableBody` involvement at all.
	ExpandedContentComponent?: StatsTableRowComponent<RawRowData, RowModel>;
};

// Factory producing a `SortableTable` `TableBodyComponent`. Whether the body is
// expandable (accordion) or flat is decided once, at creation, by whether the
// caller supplies an `ExpandedContentComponent` — so a consumer opts into the
// drill-down capability without reimplementing the wiring, and a consumer that
// doesn't want it pays for none of it.
export function createStatsTableBody<RawRowData, RowModel>({
	FirstColumnComponent,
	firstColumnKey,
	getKey,
	ExpandedContentComponent
}: StatsTableBodyConfig<RawRowData, RowModel>) {
	return function StatsTableBody({
		data,
		columnConfigs
	}: {
		data: RowModelWithRawData<RawRowData, RowModel>[];
		columnConfigs?: Partial<Record<keyof RowModel, ColumnConfig>>;
	}) {
		const orderedColumnProperties = Object.keys(columnConfigs ?? {}).filter(
			(property) => property !== firstColumnKey
		) as (keyof RowModel)[];

		function RestColumns({
			model
		}: {
			model: RowModelWithRawData<RawRowData, RowModel>;
		}) {
			return orderedColumnProperties.map((property) => (
				<td
					key={property as string}
					className={columnConfigs?.[property]?.cellClassName}
				>
					{model[property] as React.ReactNode}
				</td>
			));
		}

		if (ExpandedContentComponent) {
			return (
				<AccordionTableBody<RowModelWithRawData<RawRowData, RowModel>>
					data={data}
					getKey={getKey}
					columnCount={orderedColumnProperties.length + 1}
					FirstColumnComponent={FirstColumnComponent}
					RestColumnsComponent={RestColumns}
					ExpandedContentComponent={ExpandedContentComponent}
				/>
			);
		}

		return (
			<tbody>
				{data.map((model) => (
					<tr key={getKey(model)}>
						<td>
							<FirstColumnComponent model={model} />
						</td>
						<RestColumns model={model} />
					</tr>
				))}
			</tbody>
		);
	};
}
