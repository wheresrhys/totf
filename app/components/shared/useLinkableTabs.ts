'use client';

import { useCallback, useState } from 'react';
import { resolveInitialTabId } from '@/app/lib/tab-query-param';

/**
 * Shared tab-state hook for the app's `?tabId=`-linkable tab pages — species,
 * summary and session (#803/#804/#805, unified here in #818). Each of those
 * pages previously repeated the same resolve-initial-tab + `useState` +
 * select-handler block inline; this is the single implementation of it.
 *
 * Given the render's own tab ids, its route-depth default, and the optional
 * requested `initialTabId` (the resolved `?tabId=` search param), it:
 *  - resolves the initial active tab via `resolveInitialTabId` (a real,
 *    known requested tab wins; anything else falls back to `defaultTabId`),
 *  - seeds `activeTab` and a `loadedTabs` set (for lazy per-tab loading) from
 *    that resolved tab, so the linked tab is active and loaded on first paint,
 *  - and returns a `selectTab` handler that marks a tab both loaded and active.
 *
 * Pages that lazily load per-tab data (species, session) read `loadedTabs` to
 * gate their `ConditionalTabPanel`s; pages that render every tab eagerly
 * (summary) simply ignore it. All three wire `selectTab` into `TabNav`'s
 * `onTabChange`.
 */
export function useLinkableTabs({
	tabIds,
	defaultTabId,
	initialTabId
}: {
	tabIds: readonly string[];
	defaultTabId: string;
	initialTabId?: string;
}): {
	activeTab: string;
	loadedTabs: Set<string>;
	selectTab: (tabId: string) => void;
} {
	const initialTab = resolveInitialTabId(initialTabId, tabIds, defaultTabId);
	const [loadedTabs, setLoadedTabs] = useState<Set<string>>(
		() => new Set([initialTab])
	);
	const [activeTab, setActiveTab] = useState(initialTab);
	const selectTab = useCallback((tabId: string) => {
		setLoadedTabs((prev) => new Set([...prev, tabId]));
		setActiveTab(tabId);
	}, []);
	return { activeTab, loadedTabs, selectTab };
}
