'use client';

interface TabConfig {
	id: string;
	label: string;
}

interface TabNavProps {
	tabs: TabConfig[];
	activeTab: string;
	onTabChange: (id: string) => void;
	ariaLabel?: string;
}

export function TabNav({
	tabs,
	activeTab,
	onTabChange,
	ariaLabel = 'Tabs'
}: TabNavProps) {
	return (
		<nav
			className="flex overflow-x-auto mt-4 border-b border-base-300"
			role="tablist"
			aria-label={ariaLabel}
			aria-orientation="horizontal"
		>
			{tabs.map(({ id, label }) => (
				<button
					key={id}
					type="button"
					id={id}
					aria-current={activeTab === id ? 'true' : undefined}
					className={
						activeTab === id
							? 'px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm whitespace-nowrap font-medium bg-base-100 border border-base-300 border-b-base-100 rounded-t-sm -mb-px'
							: 'px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm whitespace-nowrap text-base-content/60 hover:text-base-content cursor-pointer'
					}
					onClick={() => onTabChange(id)}
				>
					{label}
				</button>
			))}
		</nav>
	);
}
