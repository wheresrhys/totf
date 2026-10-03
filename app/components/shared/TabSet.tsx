'use client';

import { TabNav } from '@/app/components/TabNav';
import { ConditionalTabPanel } from '@/app/components/shared/ConditionalTabPanel';
import { TabContent, type TabConfig } from '@/app/components/shared/TabContent';
import { useLinkableTabs } from '@/app/components/shared/useLinkableTabs';
import type { ViewedGroup } from '@/app/lib/group-slug';

/**
 * The whole page-level tab block in one declarative call: tab nav, tab state
 * (`useLinkableTabs`, including the `?tabId=` read on load and write-back on
 * select), lazy per-tab mounting (`ConditionalTabPanel`) and per-tab
 * fetch/loading/error handling (`TabContent`).
 *
 * Every tabbed page used to repeat that same block by hand — build a tabs
 * array, call `useLinkableTabs`, render `TabNav`, then map out one
 * `ConditionalTabPanel` + content per tab. Pages now just declare their
 * `TabConfig[]` and hand it here.
 *
 * Pure composition: it adds no state of its own beyond what `useLinkableTabs`
 * already owns.
 */
export function TabSet<ParamsType>({
	tabs,
	params,
	viewedGroup,
	initialTabId,
	initialTabData,
	ariaLabel
}: {
	tabs: TabConfig<unknown, ParamsType>[];
	params: ParamsType;
	viewedGroup: ViewedGroup;
	initialTabId?: string;
	initialTabData?: { tabId: string; data: unknown };
	ariaLabel?: string;
}) {
	const { activeTab, loadedTabs, selectTab } = useLinkableTabs({
		tabIds: tabs.map((tab) => tab.id),
		defaultTabId: tabs[0].id,
		initialTabId
	});

	return (
		<>
			<TabNav
				tabs={tabs.map(({ id, label }) => ({ id, label }))}
				activeTab={activeTab}
				onTabChange={selectTab}
				ariaLabel={ariaLabel}
			/>
			{tabs.map(({ id, dataFetcher, TabComponent }) => (
				<ConditionalTabPanel
					key={id}
					loadedTabs={loadedTabs}
					tabId={id}
					activeTabId={activeTab}
				>
					<TabContent<unknown, ParamsType>
						dataFetcher={dataFetcher}
						TabComponent={TabComponent}
						params={params}
						viewedGroup={viewedGroup}
						// Spread rather than `initialData={...}`: `TabContent` treats
						// "prop present but `null`" (a prefetch that legitimately found
						// nothing) as already-fetched and "prop absent" as needs-fetching,
						// so a non-matching tab must get no `initialData` key at all —
						// passing `undefined` explicitly would be indistinguishable here,
						// but spreading keeps the two cases honest and self-documenting.
						{...(initialTabData?.tabId === id
							? { initialData: initialTabData.data }
							: {})}
					/>
				</ConditionalTabPanel>
			))}
		</>
	);
}
