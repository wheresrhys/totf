'use client';
import { useEffect, useState, Fragment } from 'react';
type AccordionTableComponent<ItemModel> = React.ComponentType<{
	model: ItemModel;
}>;

type AccordionTableProps<ItemModel> = {
	FirstColumnComponent: AccordionTableComponent<ItemModel>;
	RestColumnsComponent: AccordionTableComponent<ItemModel>;
	ExpandedContentComponent: AccordionTableComponent<ItemModel>;
	data: ItemModel[];
	getKey: (item: ItemModel) => string;
	columnCount: number;
};

export function AccordionTableBody<ItemModel>({
	FirstColumnComponent,
	RestColumnsComponent,
	ExpandedContentComponent,
	data,
	getKey,
	columnCount
}: AccordionTableProps<ItemModel>) {
	const [expandedRow, setExpandedRow] = useState<string | false>(false);
	useEffect(() => {
		setExpandedRow(false);
	}, []);
	return (
		<tbody>
			{data.map((item: ItemModel) => {
				const rowId = getKey(item);
				const isExpanded = expandedRow === rowId;
				return (
					<Fragment key={rowId}>
						<tr>
							<td className="flex justify-left gap-2">
								<button
									type="button"
									onClick={() => setExpandedRow(isExpanded ? false : rowId)}
								>
									<span
										className={`icon-[tabler--circle-arrow-down] ${isExpanded ? '-rotate-180' : ''} size-5 shrink-0`}
									></span>
								</button>
								<FirstColumnComponent model={item} />
							</td>

							<RestColumnsComponent model={item} />
						</tr>
						{isExpanded ? (
							<tr>
								<td colSpan={columnCount}>
									<ExpandedContentComponent model={item} />
								</td>
							</tr>
						) : null}
					</Fragment>
				);
			})}
		</tbody>
	);
}
