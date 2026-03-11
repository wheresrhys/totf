'use client';
type HeadingComponent<ItemModel> = React.ComponentType<{
	model: ItemModel;
	expandedId: string | false;
}>;
type ContentComponent<ItemModel> = React.ComponentType<{
	model: ItemModel;
	expandedId: string | false;
	groupId?: number;
}>;

export function AccordionItem<ItemModel>({
	id,
	model,
	onToggle,
	expandedId,
	HeadingComponent,
	ContentComponent,
	testId,
	icon
}: {
	id: string;
	model: ItemModel;
	onToggle: (id: string | false) => void;
	expandedId: string | false;
	HeadingComponent: HeadingComponent<ItemModel>;
	ContentComponent: ContentComponent<ItemModel>;
	testId?: string;
	icon?: string;
}) {
	async function onClick(isAlreadyExpanded: boolean) {
		if (isAlreadyExpanded) {
			onToggle(false);
		} else {
			onToggle(id);
		}
	}
	const isExpanded = expandedId === id;
	const iconStyles = icon
		? `icon-[tabler--${icon}]`
		: `icon-[tabler--chevron-left] ${isExpanded ? '-rotate-90' : ''} transition-transform duration-300 rtl:-rotate-180`;
	return (
		<li data-testid={testId}>
			<div className="flex basis-full">
				<button
					onClick={() => onClick(isExpanded)}
					aria-controls={`${id}-content`}
					aria-expanded={isExpanded}
					id={`${id}-header`}
					className="flex items-center justify-between cursor-pointer basis-full"
				>
					<HeadingComponent model={model} expandedId={expandedId} />
					<span className={`size-5 shrink-0 ${iconStyles}`}></span>
				</button>
			</div>
			<div
				id={`${id}-content`}
				className={`w-full ${isExpanded ? '' : 'hidden'} overflow-hidden transition-[height] duration-300`}
				aria-labelledby={`${id}-header`}
				role="region"
			>
				<ContentComponent model={model} expandedId={expandedId} />
			</div>
		</li>
	);
}
