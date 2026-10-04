'use client';

import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { buildGroupSummaryHref } from '@/app/lib/group-links';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { SummaryTabParams } from './summary-tab-params';

// From the plain sibling module, where every summary tab id lives so the
// server-side `page.tsx`es can read them as real strings (#1096).
import { YEAR_TOTALS_TAB_ID } from './summary-tab-prefetchers';
export { YEAR_TOTALS_TAB_ID } from './summary-tab-prefetchers';

// The all-time summary page's "Year totals" tab — prop-fed, no `dataFetcher`:
// `yearlyTotals` arrives already-resolved from the page's own fetch, so
// there's nothing for this tab to fetch itself (#1067). Reads its rows off
// the shared `params` object (`SummaryTotalsSection`'s single combined
// `TabSet` params) rather than a `data` arg, since `dataFetcher` is never
// called for this tab.
export const summaryYearTotalsTab: TabConfig<null, SummaryTabParams> = {
	id: YEAR_TOTALS_TAB_ID,
	label: 'Year totals',
	TabComponent: ({ params, viewedGroup }) => (
		<PeriodTotalsTable
			timeInterval="year"
			rows={params.yearlyTotals ?? []}
			firstColumnHeader="Year"
			buildHref={(timePeriod) =>
				buildGroupSummaryHref(viewedGroup, {
					year: new Date(timePeriod).getFullYear()
				})
			}
			totalsStats={
				params.tabsWithTotalsRow?.[YEAR_TOTALS_TAB_ID]
					? params.totalsStats
					: undefined
			}
		/>
	)
};
