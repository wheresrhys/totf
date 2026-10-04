'use client';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { MistakesDiscrepancyTab } from '@/app/components/pages/mistakes/MistakesDiscrepancyTab';
import { TabSet, type TabSetTabConfig } from '@/app/components/shared/TabSet';
import { resolveInitialTabId } from '@/app/lib/tab-query-param';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { DiscrepenciesResult } from '@/app/models/db';

// `tabId` is the raw, unresolved `?tabId=` search param, read in `page.tsx`'s
// `getParams` (#803's mechanism). Unlike every other `TabSet` page it is
// *not* resolved against the page's tab ids server-side, because those ids
// don't exist yet at that point — see `MistakesPageContent` below.
export type PageParams = { tabId?: string };

function formatTabLabel(discrepancyType: string): string {
	const withSpaces = discrepancyType.replace(/_/g, ' ');
	return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function groupByDiscrepancyType(
	mistakes: DiscrepenciesResult[]
): Record<string, DiscrepenciesResult[]> {
	return mistakes.reduce<Record<string, DiscrepenciesResult[]>>(
		(grouped, mistake) => {
			const type = mistake.discrepency_type;
			if (!grouped[type]) {
				grouped[type] = [];
			}
			grouped[type].push(mistake);
			return grouped;
		},
		{}
	);
}

/**
 * The mistakes page: one tab per kind of self-contradiction found in the
 * group's records.
 *
 * This is the one `TabSet` page whose tab list is **data-driven** — the ids
 * are whichever `discrepency_type`s `find_discrepencies` actually returned,
 * so they're unknown until that RPC resolves. Two consequences, both
 * deliberate:
 *
 *  - `resolveInitialTabId` runs *here*, not in `page.tsx`. `BootstrapPage`'s
 *    `getParams` is the only hook `page.tsx` has before the fetch, and it
 *    sees neither the fetched data nor the viewed group; re-running
 *    `find_discrepencies` there purely to learn the type list would double
 *    the RPC cost for nothing. So `page.tsx` threads the raw `?tabId=`
 *    through and the resolution happens once the data is in hand.
 *  - **`prefetchActiveTabData` is never called for this page.** Every tab is
 *    `dataFetcher`-less: the single page-wide `find_discrepencies` call
 *    already carries every type's rows, so there is no per-tab fetch to
 *    prefetch and nothing for `TabSet`'s `initialTabData` to hold.
 */
export function MistakesPageContent({
	params,
	data: mistakes,
	viewedGroup
}: {
	params: PageParams;
	data: DiscrepenciesResult[];
	viewedGroup: ViewedGroup;
}) {
	const grouped = groupByDiscrepancyType(mistakes);
	const discrepancyTypes = Object.keys(grouped);
	const tabs: TabSetTabConfig<PageParams, PageParams>[] = discrepancyTypes.map(
		(discrepancyType) => ({
			id: discrepancyType,
			label: formatTabLabel(discrepancyType),
			// Prop-fed by closure over the rows this type already has, the same
			// treatment species' `dataFetcher`-less adapter tabs get (#1060):
			// `TabContent`'s `{params, data, viewedGroup}` are all irrelevant
			// here, since `data` could only ever be the `null` a tab with no
			// `dataFetcher` is handed.
			TabComponent: () => (
				<MistakesDiscrepancyTab
					discrepancyType={discrepancyType}
					mistakes={grouped[discrepancyType]}
				/>
			)
		})
	);

	return (
		<PageWrapper>
			<PrimaryHeading>Mistakes</PrimaryHeading>
			{/* A group with no discrepancies at all has no tabs to show — and
			    `TabSet` reads `tabs[0].id` for its default, so an empty array
			    can't be handed to it anyway. */}
			{tabs.length > 0 && (
				<TabSet
					tabs={tabs}
					params={params}
					viewedGroup={viewedGroup}
					initialTabId={resolveInitialTabId(
						params.tabId,
						discrepancyTypes,
						discrepancyTypes[0]
					)}
				/>
			)}
		</PageWrapper>
	);
}
