import { Fragment } from 'react';
export function PageWrapper({ children }: { children: React.ReactNode }) {
	return <div className="m-3">{children}</div>;
}
export function PrimaryHeading({ children }: { children: React.ReactNode }) {
	return (
		<h1 className="text-base-content text-2xl sm:text-3xl mt-2 mb-2 sm:mt-4 sm:mb-4">
			{children}
		</h1>
	);
}
export function SecondaryHeading({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="text-base-content text-xl sm:text-2xl mt-2 mb-2sm:mt-3 sm:mb-3">
			{children}
		</h2>
	);
}
export function BoxyList({
	children,
	testId
}: {
	children: React.ReactNode;
	testId?: string;
}) {
	return (
		<ul
			data-testid={testId}
			className="border-base-content/25 divide-base-content/25 divide-y rounded-md border *:p-3 *:first:rounded-t-md *:last:rounded-b-md"
		>
			{children}
		</ul>
	);
}

// Default table size: compact (`table-xs`) on small screens, full size
// (`table-md`, FlyonUI's default) from `sm:` up — see issue #605. Callers
// that need a different size still pass their own `className`.
export const defaultTableClassName = 'table table-xs sm:table-md';

export function Table({
	children,
	testId,
	className = defaultTableClassName
}: {
	children: React.ReactNode;
	testId?: string;
	className?: string;
}) {
	return (
		<div className="w-full overflow-x-auto">
			<table data-testid={testId} className={className}>
				{children}
			</table>
		</div>
	);
}

export function InlineTable({
	children,
	testId
}: {
	children: React.ReactNode;
	testId?: string;
}) {
	return (
		<table data-testid={testId} className="table table-xs">
			{children}
		</table>
	);
}

export function BadgeList({
	items,
	testId
}: {
	items: string[];
	testId?: string;
}) {
	return (
		<ul data-testid={testId} className="flex flex-wrap gap-2">
			{items.map((item) => (
				<li key={item} className="badge badge-secondary">
					{item}
				</li>
			))}
		</ul>
	);
}

export function UnwrappedBadgeList({ items }: { items: string[] }) {
	return (
		<Fragment>
			{items.map((item) => (
				<span key={item} className="badge badge-secondary">
					{item}
				</span>
			))}
		</Fragment>
	);
}

export function printLocationName(locationName: string) {
	const hasParentheses = /\(/.test(locationName);
	if (!hasParentheses) return locationName;
	const openingParenthesesIndex = locationName.indexOf('(');
	const closingParenthesesIndex = locationName.lastIndexOf(')');
	const parenthesizedPart = locationName.substring(
		openingParenthesesIndex + 1,
		closingParenthesesIndex
	);
	return parenthesizedPart;
}
