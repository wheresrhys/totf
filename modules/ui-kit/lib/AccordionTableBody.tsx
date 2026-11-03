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

// const [birdDetail, setBirdDetail] = useState<Encounter[]>(
//   expandedBird === ring_no ? encounters : []
// );
// function toggleBirdDetail() {
//   if (expandedBird === ring_no) {
//     onExpand(null);
//     setBirdDetail([]);
//   } else {
//     onExpand(ring_no);
//     setBirdDetail(encounters);
//   }
// }

// function ExpandableRowWrapper<ItemModel>({
//   ExpandedContentComponent
//   model
// }: {
//   ExpandedContentComponent: AccordionTableComponent<ItemModel>;
//   model: ItemModel;
// }) {

//   const [expandedData, setExpandedData] = useState<Encounter[]>(
//     expandedBird === ring_no ? encounters : []
//   );
//   function toggleBirdDetail() {
//     if (expandedBird === ring_no) {
//       onExpand(null);
//       setBirdDetail([]);
//     } else {
//       onExpand(ring_no);
//       setBirdDetail(encounters);
//     }
//   }

// }

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
									// className="btn btn-outline btn-secondary btn-xs btn-square"
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
