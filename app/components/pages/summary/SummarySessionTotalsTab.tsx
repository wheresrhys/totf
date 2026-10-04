'use client';

import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { buildGroupSessionHref } from '@/app/lib/group-links';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { SummaryTabParams } from './summary-tab-params';
// Id and `dataFetcher` live in the plain (non-`'use client'`) sibling module
// so `summary/**/page.tsx` can read them server-side — see its header comment
// (#1096). This file owns only the presentational half.
import {
	SESSION_TOTALS_TAB_ID,
	fetchSummarySessionTotalsData,
	type SummarySessionTotalsData
} from './summary-tab-prefetchers';

export {
	SESSION_TOTALS_TAB_ID,
	type SummarySessionTotalsData
} from './summary-tab-prefetchers';

// The lazy variant only — shown on the all-time/year summary pages, where
// `SummaryTotalsSection` has no `sessionTotals` prop to render eagerly. The
// eager variant (month page, fed via the `sessionTotals` prop) stays inline
// in `SummaryTotalsSection.tsx`, untouched by this ticket.
export const summarySessionTotalsTab: TabConfig<
	SummarySessionTotalsData,
	SummaryTabParams
> = {
	id: SESSION_TOTALS_TAB_ID,
	label: 'Session totals',
	dataFetcher: fetchSummarySessionTotalsData,
	TabComponent: ({ params, data, viewedGroup }) => (
		<PeriodTotalsTable
			timeInterval="day"
			rows={data ?? []}
			firstColumnHeader="Session"
			buildHref={(timePeriod) => buildGroupSessionHref(viewedGroup, timePeriod)}
			totalsStats={params.totalsStats}
			showBusiestSession={false}
		/>
	)
};
