'use client';
import { useState } from 'react';
import { PeriodTotalsTable } from '@/app/components/PeriodTotalsTable';
import {
	buildMonthTotalsRows,
	filterEmptyMonthTotalsRows,
	formatMonthYearLabel
} from '@/app/lib/month-totals';
import { EmptyMonthsToggle } from '@/app/components/shared/EmptyMonthsToggle';
import type { CoreStatsResult } from '@/app/models/db';
import type { SpeciesTotalsTabParams } from '@/app/actions/sp-data';
import type { ViewedGroup } from '@/app/lib/group-slug';

// Pure presentational `TabConfig.TabComponent` (#1065) — see `SpYearTotalsTab`'s
// comment on `data: unknown` for why the cast below is needed; fetching/
// loading/error state now lives in `TabContent` (#1057), driven by
// `fetchMonthTotalsTabData` (`app/actions/sp-data.ts`) via `TabSet`.
export function SpMonthTotalsTab({
	params,
	data
}: {
	params: SpeciesTotalsTabParams;
	data: unknown;
	viewedGroup: ViewedGroup;
}) {
	const monthlyStats = (data as CoreStatsResult[] | null) ?? [];
	// Plain local state, unrelated to the data-loading change above — `TabSet`'s
	// `ConditionalTabPanel` unmounts this tab on every tab switch, so the toggle
	// naturally resets to Hide (`true`) each time the tab is revisited, with no
	// extra code needed.
	const [hideEmptyMonths, setHideEmptyMonths] = useState(true);

	// `year` is always defined when this tab is mounted — `buildSpeciesTotalsTabs`
	// (`PageContent.tsx`) only includes `month-totals` in the `TabConfig[]` array
	// when the route is year-scoped.
	const year = params.year as number;

	// Zero-fill across all 12 calendar months, same as the year summary page's
	// "Month totals" tab (`summary/[year]/page.tsx`) — `core_stats`'s spine
	// only spans actual session months. The model returns pure data only, so
	// both href and label are derived here for the species route.
	const monthTotalsRows = buildMonthTotalsRows(year, monthlyStats);
	const monthTotalsByTimePeriod = new Map(
		monthTotalsRows.map((row) => [row.stats.time_period, row])
	);
	const visibleRows = filterEmptyMonthTotalsRows(
		monthTotalsRows,
		hideEmptyMonths
	);

	return (
		<PeriodTotalsTable
			timeInterval="month"
			rows={visibleRows.map((row) => row.stats)}
			firstColumnHeader="Month"
			showSpeciesColumn={false}
			buildHref={(timePeriod) =>
				`/species/${params.speciesName}/${year}/${Number(timePeriod.slice(5, 7))}`
			}
			buildLabel={(timePeriod) =>
				formatMonthYearLabel(monthTotalsByTimePeriod.get(timePeriod))
			}
			extraControls={
				<EmptyMonthsToggle
					value={hideEmptyMonths}
					onChange={setHideEmptyMonths}
				/>
			}
		/>
	);
}
