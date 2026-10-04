'use client';

import { TabNav } from '@/app/components/TabNav';
import { ConditionalTabPanel } from '@/app/components/shared/ConditionalTabPanel';
import {
	TabContent,
	type TabConfig,
	type TabConfigInSet
} from '@/app/components/shared/TabContent';
import { useLinkableTabs } from '@/app/components/shared/useLinkableTabs';
import type { ViewedGroup } from '@/app/lib/group-slug';

/**
 * One entry in a `TabSet`'s `tabs` array. Each tab gets its **own**
 * `OwnParamsType`, independent of every other tab's in the same set: tabs on a
 * page often share params, but nothing says they always will. The set's
 * `params` prop is the default — see `TabConfigInSet` for when a tab is
 * obliged to declare its own instead.
 */
export type TabSetTabConfig<SharedParamsType, OwnParamsType> = TabConfigInSet<
	SharedParamsType,
	OwnParamsType,
	TabConfig<unknown, OwnParamsType>
>;

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
 * `tabs` is typed as a mapped tuple over `TabParamsTuple` rather than a plain
 * array, which is what lets TypeScript infer each tab's `OwnParamsType`
 * separately instead of forcing one shared one across the whole array. One
 * consequence worth knowing: a *heterogeneous* tabs array assigned to a
 * variable first needs `as const` (or an explicit tuple annotation), since a
 * plain `const tabs = [...]` widens to a single union element type and loses
 * the per-tab types. A homogeneous array needs nothing special.
 *
 * Pure composition: it adds no state of its own beyond what `useLinkableTabs`
 * already owns.
 *
 * An empty `tabs` array renders nothing (#1095) rather than throwing on the
 * unguarded `tabs[0]` a default tab id needs — a data-driven tab list (e.g.
 * Mistakes, whose tabs are one per discrepancy type actually found) can
 * legitimately have zero entries, and that's a normal empty state, not a bug
 * to defend against in every such caller. `useLinkableTabs` is still called
 * unconditionally above the empty check, same as any other hook — React
 * requires that regardless of what this render ends up returning; feeding it
 * an empty `tabIds`/a fallback `''` default is harmless since nothing reads
 * `activeTab` once the component bails out to `null`.
 */
export function TabSet<
	SharedParamsType,
	TabParamsTuple extends readonly unknown[]
>({
	tabs,
	params,
	viewedGroup,
	initialTabId,
	initialTabData,
	ariaLabel
}: {
	tabs: {
		[Index in keyof TabParamsTuple]: TabSetTabConfig<
			SharedParamsType,
			TabParamsTuple[Index]
		>;
	};
	params: SharedParamsType;
	viewedGroup: ViewedGroup;
	initialTabId?: string;
	initialTabData?: { tabId: string; data: unknown };
	ariaLabel?: string;
}) {
	const { activeTab, loadedTabs, selectTab } = useLinkableTabs({
		tabIds: tabs.map((tab) => tab.id),
		defaultTabId: tabs[0]?.id ?? '',
		initialTabId
	});

	if (tabs.length === 0) {
		return null;
	}

	return (
		<>
			<TabNav
				tabs={tabs.map(({ id, label }) => ({ id, label }))}
				activeTab={activeTab}
				onTabChange={selectTab}
				ariaLabel={ariaLabel}
			/>
			{tabs.map(({ id, params: ownParams, dataFetcher, TabComponent }) => (
				<ConditionalTabPanel
					key={id}
					loadedTabs={loadedTabs}
					tabId={id}
					activeTabId={activeTab}
				>
					<TabContent
						dataFetcher={dataFetcher}
						TabComponent={TabComponent}
						// A tab's own `params` win over the set's shared ones; a tab
						// that declared none gets the shared ones (see
						// `TabSetTabConfig`, which is what guarantees a tab the shared
						// params can't satisfy had to declare its own).
						params={ownParams ?? params}
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
