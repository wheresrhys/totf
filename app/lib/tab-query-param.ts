// Shared `?tabId=<id>` -> focused-tab mechanism (#803). Any tab-based page
// that wants a deep link to a specific tab (species today; summary and
// session in follow-up tickets) reads its `tabId` search param via
// `readTabIdSearchParam` in its `page.tsx` `getParams` override, then resolves
// it against its own known tab ids with `resolveInitialTabId` in its client
// content component, seeding `activeTab`/`loadedTabs` from the result instead
// of a bare route-depth default. This never affects `getCacheKeys` — it only
// changes which tab is focused/loaded first on the client, not the fetched
// page data.

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
