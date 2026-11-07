'use client';
import { useState } from 'react';
import { PeriodTotalsTable, EmptySessionsToggle } from '@/modules/stats-view';
import { filterEmptySessionRows } from '@/app/lib/month-totals';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import type { ViewedGroup } from '@/app/lib/group-slug';

// Pure presentational `TabConfig.TabComponent` (#1065) — see `SpYearTotalsTab`'s
// comment on `data: unknown` for why the cast below is needed; fetching/
// loading/error state now lives in `TabContent` (#1057), driven by
// `fetchSessionTotalsTabData` (`app/actions/sp-data.ts`) via `TabSet`.
export function SpSessionTotalsTab({
	data,
	viewedGroup
}: {
	params: SpeciesTotalsTabParams;
	data: unknown;
	viewedGroup: ViewedGroup;
}) {
	const sessionTotals = (data as CoreStatsResult[] | null) ?? [];
	// Plain local state, unrelated to the data-loading change above — `TabSet`'s
	// `ConditionalTabPanel` unmounts this tab on every tab switch, so the toggle
	// naturally resets to Hide (`true`) each time the tab is revisited, with no
	// extra code needed. Mirrors `SpMonthTotalsTab`'s `hideEmptyMonths` state.
	const [hideEmptySessions, setHideEmptySessions] = useState(true);
	const visibleRows = filterEmptySessionRows(sessionTotals, hideEmptySessions);

	return (
		<PeriodTotalsTable
			timeInterval="day"
			rows={visibleRows}
			firstColumnHeader="Session"
			buildHref={(timePeriod) =>
				`/group/${viewedGroup.slug}/session/${timePeriod}`
			}
			showBusiestSession={false}
			extraControls={
				<EmptySessionsToggle
					value={hideEmptySessions}
					onChange={setHideEmptySessions}
				/>
			}
		/>
	);
}
