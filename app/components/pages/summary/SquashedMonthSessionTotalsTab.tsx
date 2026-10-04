'use client';

import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import { buildGroupSessionHref } from '@/app/lib/group-links';
import type { TabConfig } from '@/app/components/shared/TabContent';
import {
	SQUASHED_MONTH_SESSION_TOTALS_TAB_ID,
	type SquashedMonthTabParams
} from './squashed-month-tab-params';

// No `dataFetcher`: the rows arrive via `TabSet`'s shared params — see
// `SquashedMonthSpeciesTotalsTab.tsx` for the rationale. (The all-time/year
// summary pages' `summarySessionTotalsTab` does fetch lazily; this page's
// equivalent rows come free with the page's own squashed-month stats call.)
export const squashedMonthSessionTotalsTab: TabConfig<
	unknown,
	SquashedMonthTabParams
> = {
	id: SQUASHED_MONTH_SESSION_TOTALS_TAB_ID,
	label: 'Session totals',
	TabComponent: ({ params, viewedGroup }) => (
		<PeriodTotalsTable
			timeInterval="day"
			rows={params.sessionTotalsForMonth}
			firstColumnHeader="Session"
			buildHref={(timePeriod) => buildGroupSessionHref(viewedGroup, timePeriod)}
			totalsStats={params.totalsStats}
			showBusiestSession={false}
		/>
	)
};
