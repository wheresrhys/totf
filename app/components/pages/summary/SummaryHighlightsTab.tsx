'use client';

import { BoxyList } from '@/app/components/shared/DesignSystem';
// Imported from its own file (not from `SummaryTotalsSection.tsx`, which
// re-exports it for its other two consumers) to avoid a circular import:
// `SummaryTotalsSection.tsx` itself imports `summaryHighlightsTab` from this
// file. `renderCombinedHighlights` (`SessionHighlights.tsx`) has other
// consumers already importing it from its current location
// (`SpHighlightsTab.tsx`), so moving it here would break that import path.
import { HighlightsByTimePeriod } from '@/app/components/HighlightsByTimePeriod';
import { renderCombinedHighlights } from '@/app/components/pages/session/SessionHighlights';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { SummaryTabParams } from './summary-tab-params';
// Id and `dataFetcher` live in the plain (non-`'use client'`) sibling module
// so `summary/**/page.tsx` can read them server-side — see its header comment
// (#1096). This file owns only the presentational half.
import {
	HIGHLIGHTS_TAB_ID,
	fetchSummaryHighlightsData,
	type SummaryHighlightsData
} from './summary-tab-prefetchers';

export {
	HIGHLIGHTS_TAB_ID,
	type SummaryHighlightsData
} from './summary-tab-prefetchers';

export const summaryHighlightsTab: TabConfig<
	SummaryHighlightsData,
	SummaryTabParams
> = {
	id: HIGHLIGHTS_TAB_ID,
	label: 'Highlights',
	dataFetcher: fetchSummaryHighlightsData,
	// Highlights are generated client-side on purpose (#1089) — and a
	// `CombinedHighlight` carries its printers as function properties, so a
	// server-prefetched payload could never cross the boundary back into this
	// client component anyway. See `summary-tab-prefetchers.ts`.
	clientSideOnly: true,
	TabComponent: ({ data, viewedGroup }) => (
		<div>
			{data && (
				<>
					{data.localHighlights.length && (
						<>
							<h2>Records</h2>
							<BoxyList>
								{renderCombinedHighlights(data.localHighlights)}
							</BoxyList>
						</>
					)}
					<HighlightsByTimePeriod
						highlights={data.sessionHighlights}
						viewedGroup={viewedGroup}
						heading="Session highlights"
					/>
					<HighlightsByTimePeriod
						highlights={data.monthHighlights}
						viewedGroup={viewedGroup}
						heading="Month highlights"
					/>
				</>
			)}
		</div>
	)
};
