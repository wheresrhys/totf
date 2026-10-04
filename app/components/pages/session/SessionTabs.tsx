'use client';

import { TabSet } from '@/app/components/shared/TabSet';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { ViewedGroup } from '@/app/lib/group-slug';
import {
	fetchSessionHighlightLines,
	type SessionTabParams
} from './session-tab-config';
import { SessionMistNettingTab } from './SessionMistNettingTab';
import { SessionOtherCatchesTab } from './SessionOtherCatchesTab';
import { SessionNetRoundsTab } from './SessionNetRoundsTab';
import { SessionHighlights } from './SessionHighlights';

type SessionTabConfig = TabConfig<unknown, SessionTabParams>;

/**
 * The session page's tabs, in display order. Mist-netting and Other catches
 * only exist on a day that actually caught birds that way (#1022); Net rounds
 * and Highlights are always present. Which tab is first therefore varies by
 * day, and `TabSet` takes that first tab as the default when `?tabId=` names
 * nothing it recognises.
 *
 * Exported for direct testing of the conditional-inclusion gating, which is
 * otherwise only observable through a rendered tab nav.
 */
export function buildSessionTabs({
	hasMistNetEncounters,
	hasOtherCatches
}: {
	hasMistNetEncounters: boolean;
	hasOtherCatches: boolean;
}): SessionTabConfig[] {
	return [
		...(hasMistNetEncounters
			? [
					{
						id: 'mist-netting',
						label: 'Mist-netting',
						TabComponent: SessionMistNettingTab
					}
				]
			: []),
		...(hasOtherCatches
			? [
					{
						id: 'other-catches',
						label: 'Other catches',
						TabComponent: SessionOtherCatchesTab
					}
				]
			: []),
		{
			id: 'net-rounds',
			label: 'Net rounds',
			TabComponent: SessionNetRoundsTab
		},
		{
			id: 'highlights',
			label: 'Highlights',
			dataFetcher: fetchSessionHighlightLines,
			// `TabSet` types its whole tab list as `TabConfig<unknown, Params>[]`,
			// so a tab that knows its own data type can't be assigned without
			// widening it back to `unknown` here. Narrowing inside
			// `SessionHighlights` instead would just move the same cast somewhere
			// less visible; a per-tab data type on `TabSet` is the real fix.
			TabComponent: SessionHighlights as SessionTabConfig['TabComponent']
		}
	];
}

/**
 * The session page's whole tab block. A thin client boundary around `TabSet`:
 * the tab list carries functions (`dataFetcher`, `TabComponent`), which can't
 * be serialised from a server component, so it is built here rather than
 * passed in. Everything the server already resolved — the day's derived data,
 * the deep-linked tab and its prefetched payload — arrives as plain props.
 */
export function SessionTabs({
	params,
	viewedGroup,
	initialTabId,
	initialTabData
}: {
	params: SessionTabParams;
	viewedGroup: ViewedGroup;
	initialTabId?: string;
	initialTabData?: { tabId: string; data: unknown };
}) {
	const tabs = buildSessionTabs({
		hasMistNetEncounters: params.mistNetSpeciesList.length > 0,
		hasOtherCatches: params.otherCatchesSpeciesList.length > 0
	});

	return (
		<TabSet<SessionTabParams>
			tabs={tabs}
			params={params}
			viewedGroup={viewedGroup}
			initialTabId={initialTabId}
			initialTabData={initialTabData}
		/>
	);
}
