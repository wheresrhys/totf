'use client';

import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { buildGroupSessionHref } from '@/app/lib/group-links';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { SummaryTabParams } from './summary-tab-params';
import { SESSION_TOTALS_TAB_ID } from './summary-tab-prefetchers';

// The eager, prop-fed variant of the Session totals tab — shown on the month
// summary page, where `SummaryTotalsSection` already has `sessionTotals` in
// hand from its parent page's own fetch, so there's nothing for this tab to
// fetch itself (#1067). Shares `SESSION_TOTALS_TAB_ID` with the lazy
// `summarySessionTotalsTab` (`SummarySessionTotalsTab.tsx`, shown on the
// all-time/year pages instead) so both variants occupy the same tab id/label
// — `SummaryTotalsSection` picks exactly one of the two per render
// (`sessionTotals !== undefined`), never both at once.
export const summaryEagerSessionTotalsTab: TabConfig<null, SummaryTabParams> = {
	id: SESSION_TOTALS_TAB_ID,
	label: 'Session totals',
	TabComponent: ({ params, viewedGroup }) => (
		<PeriodTotalsTable
			timeInterval="day"
			rows={params.sessionTotals ?? []}
			firstColumnHeader="Session"
			buildHref={(timePeriod) => buildGroupSessionHref(viewedGroup, timePeriod)}
			totalsStats={
				params.tabsWithTotalsRow?.[SESSION_TOTALS_TAB_ID]
					? params.totalsStats
					: undefined
			}
			showBusiestSession={false}
		/>
	)
};
