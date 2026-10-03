// Shared `?tabId=<id>` -> focused-tab mechanism (#803). Any tab-based page
// that wants a deep link to a specific tab (species today; summary and
// session in follow-up tickets) reads its `tabId` search param via
// `readTabIdSearchParam` in its `page.tsx` `getParams` override, then resolves
// it against its own known tab ids with `resolveInitialTabId` in its client
// content component, seeding `activeTab`/`loadedTabs` from the result instead
// of a bare route-depth default. This never affects `getCacheKeys` — it only
// changes which tab is focused/loaded first on the client, not the fetched
// page data.
//
// A `TabSet`-based page resolves all three of these server-side, before first
// paint, so a deep-linked tab renders with its data already in hand rather
// than flashing a spinner and refetching on hydration (#1059):
//   1. `const requestedTabId = await readTabIdSearchParam(searchParams)` and
//      `const activeTabId = resolveInitialTabId(requestedTabId, knownTabIds,
//      defaultTabId)` — a definite, validated tab id before anything renders.
//   2. `const prefetched = await prefetchActiveTabData(tabs, activeTabId,
//      params, viewedGroup)` — that one tab's data, or `undefined` when it has
//      nothing to prefetch.
//   3. Pass `activeTabId` down as `TabSet`'s `initialTabId` and `prefetched`
//      (when defined) as its `initialTabData`.
//
// This module stays server-safe (no `'use client'`): the one thing it borrows
// from `TabContent.tsx` is the `TabConfig` type, imported `import type` so it
// is erased at compile time and no client module ends up in a server page's
// graph.
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { ViewedGroup } from '@/app/lib/group-slug';

/**
 * Resolve which tab id a tab-based page should focus initially: the
 * requested tab id if it's a real, known tab; otherwise the page's own
 * route-depth default. Falls back to `defaultTabId` for `undefined`, an
 * empty string, or any value not present in `knownTabIds` (garbage input
 * never crashes or renders a blank pane).
 */
export function resolveInitialTabId(
	requestedTabId: string | undefined,
	knownTabIds: readonly string[],
	defaultTabId: string
): string {
	if (requestedTabId && knownTabIds.includes(requestedTabId)) {
		return requestedTabId;
	}
	return defaultTabId;
}

/**
 * Read the `tabId` search param out of a `page.tsx`'s `searchParams` promise.
 * `searchParams` itself is optional (a caller that never passes it, e.g. the
 * group-scoped `withGroupScope` delegation, simply has no requested tab).
 */
export async function readTabIdSearchParam(
	searchParams?: Promise<{ tabId?: string }>
): Promise<string | undefined> {
	if (!searchParams) {
		return undefined;
	}
	const resolved = await searchParams;
	return resolved.tabId;
}

/**
 * Fetch just the active tab's data, server-side, ahead of render. Takes the
 * already-resolved `activeTabId` (see `resolveInitialTabId`) rather than the
 * raw search param, so exactly one tab's `dataFetcher` can ever run.
 *
 * Returns `undefined` — do nothing, let the tab fetch for itself on the
 * client — in the two cases where there is nothing to prefetch: the active tab
 * has no `dataFetcher` (it manages its own internal fetching/pagination), or
 * `activeTabId` matches no tab at all. The latter shouldn't happen when the id
 * came from `resolveInitialTabId`, but a caller that skipped that validation
 * gets a no-op rather than a throw.
 *
 * No caching or deduplication: `dataFetcher` is awaited exactly once per call.
 */
export async function prefetchActiveTabData<ParamsType>(
	tabs: readonly Pick<TabConfig<unknown, ParamsType>, 'id' | 'dataFetcher'>[],
	activeTabId: string,
	params: ParamsType,
	viewedGroup: ViewedGroup
): Promise<{ tabId: string; data: unknown } | undefined> {
	const activeTab = tabs.find((tab) => tab.id === activeTabId);
	if (!activeTab?.dataFetcher) {
		return undefined;
	}
	return {
		tabId: activeTabId,
		data: await activeTab.dataFetcher(params, viewedGroup)
	};
}
