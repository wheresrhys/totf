'use client';
import { SecondaryHeading } from '@/app/components/shared/DesignSystem';

// One chart on the species "Population" tab. Collapsed it is a fixed-height text
// tile (heading + description) that sits ~300px wide in the reflowing grid;
// clicking it expands the tile to hold the rendered chart. Expanded it spans the
// full grid width at every breakpoint (the other tiles reflow around it) and
// grows to whatever height its chart needs — no fixed height or inner scroll —
// and carries a small close button. The parent (`SpPopulationTab`) owns which
// tiles are expanded and lazily fetches each chart's data when it first expands.
export function ChartTile({
	heading,
	description,
	expanded,
	onExpand,
	onCollapse,
	children
}: {
	heading: string;
	description: string;
	expanded: boolean;
	onExpand: () => void;
	onCollapse: () => void;
	children: React.ReactNode;
}) {
	if (!expanded) {
		return (
			<button
				type="button"
				onClick={onExpand}
				className="border-base-content/25 hover:border-base-content/50 hover:bg-base-200 col-span-1 flex h-[200px] cursor-pointer flex-col overflow-hidden rounded-md border p-4 text-left transition-colors"
			>
				<SecondaryHeading>{heading}</SecondaryHeading>
				<p className="text-base-content/70 text-sm">{description}</p>
			</button>
		);
	}
	return (
		<div className="border-base-content/25 relative col-span-full flex flex-col rounded-md border p-4">
			<button
				type="button"
				onClick={onCollapse}
				aria-label={`Close ${heading}`}
				className="btn btn-xs btn-circle btn-ghost absolute top-1 right-1"
			>
				✕
			</button>
			<SecondaryHeading>{heading}</SecondaryHeading>
			<p className="text-base-content/70 text-sm">{description}</p>
			<div className="mt-2">{children}</div>
		</div>
	);
}
