'use client';

import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { fetchPeriodTotals } from '@/app/actions/period-totals';
import { buildGroupSessionHref } from '@/app/lib/group-links';
import type { CoreStatsResult } from '@/app/models/db';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { SummaryTabParams } from './summary-tab-params';

// The lazy variant only — shown on the all-time/year summary pages, where
// `SummaryTotalsSection` has no `sessionTotals` prop to render eagerly. The
// eager variant (month page, fed via the `sessionTotals` prop) stays inline
// in `SummaryTotalsSection.tsx`, untouched by this ticket.
export const SESSION_TOTALS_TAB_ID = 'session-totals';

// Exported so call sites (e.g. `SummaryTotalsSection`'s `initialTabData` spread)
// can cast a server-prefetched `unknown` payload back to this tab's concrete
// `DataType` without reaching for `as unknown as` (#921).
export type SummarySessionTotalsData = CoreStatsResult[];

export const summarySessionTotalsTab: TabConfig<
	SummarySessionTotalsData,
	SummaryTabParams
> = {
	id: SESSION_TOTALS_TAB_ID,
	label: 'Session totals',
	dataFetcher: (params, viewedGroup) =>
		fetchPeriodTotals(viewedGroup.id, 'day', params.fromDate, params.toDate),
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
