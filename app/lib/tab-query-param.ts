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
// #1013 made the mechanism two-way: `useLinkableTabs` writes the focused tab
// back onto the URL (`setTabIdSearchParam`) as the user clicks tabs, and
// `TabAwareLink` carries the focused tab onto outgoing internal links
// (`appendTabIdSearchParam`), so a tab choice survives both a reload and a
// drill-down into a deeper route depth.

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

export const TAB_ID_SEARCH_PARAM = 'tabId';

/**
 * Rewrite an absolute URL's `tabId` search param to `tabId`, returning a
 * root-relative URL (`/path?query#hash`) — the shape
 * `window.history.replaceState` wants. Every other search param and the hash
 * are preserved; an existing `tabId` is overwritten, since the tab the user
 * just clicked is by definition the current one (#1013).
 */
export function setTabIdSearchParam(
	absoluteUrl: string,
	tabId: string
): string {
	const parsed = new URL(absoluteUrl);
	parsed.searchParams.set(TAB_ID_SEARCH_PARAM, tabId);
	return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Append `tabId=<currentTabId>` to an internal link href so following the link
 * lands on the equivalent tab of the target page (#1013) — the link half of
 * persistent tabs, used by `TabAwareLink`.
 *
 * Left untouched when: there is no current tab (no enclosing
 * `CurrentTabProvider`), the href already names a `tabId` (an explicit deep
 * link beats the ambient one), or the href isn't a root-relative internal path
 * (an external URL or a bare fragment is none of this mechanism's business).
 * Any existing query string and hash are preserved.
 */
export function appendTabIdSearchParam(
	href: string,
	currentTabId: string | undefined
): string {
	if (!currentTabId || !href.startsWith('/')) {
		return href;
	}
	const [pathAndQuery, ...hashSegments] = href.split('#');
	const [path, query = ''] = pathAndQuery.split('?');
	const searchParams = new URLSearchParams(query);
	if (searchParams.has(TAB_ID_SEARCH_PARAM)) {
		return href;
	}
	searchParams.set(TAB_ID_SEARCH_PARAM, currentTabId);
	const hash = hashSegments.length > 0 ? `#${hashSegments.join('#')}` : '';
	return `${path}?${searchParams.toString()}${hash}`;
}
