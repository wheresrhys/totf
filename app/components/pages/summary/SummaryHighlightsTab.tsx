'use client';

import {
	getHighlightsWithinTimeWindow,
	getCondensedHighlightsAtTimePeriod
} from '@/app/lib/highlights';
import { BoxyList } from '@/app/components/shared/DesignSystem';
// Imported, not relocated — `HighlightsByTimePeriod` (`SummaryTotalsSection.tsx`)
// and `renderCombinedHighlights` (`SessionHighlights.tsx`) both have other
// consumers already importing them from their current locations
// (`SquashedMonthSummaryTotalsSection.tsx`, `SpHighlightsTab.tsx`), so moving
// either here would break those import paths.
import { HighlightsByTimePeriod } from '@/app/components/SummaryTotalsSection';
import { renderCombinedHighlights } from '@/app/components/pages/session/SessionHighlights';
import type { TabConfig } from '@/app/components/shared/TabContent';
import type { ViewedGroup } from '@/app/lib/group-slug';
import type { SummaryTabParams } from './summary-tab-params';

export const HIGHLIGHTS_TAB_ID = 'highlights';

async function fetchSummaryHighlightsData(
	params: SummaryTabParams,
	viewedGroup: ViewedGroup
) {
	const { year, month } = params;
	const [daily, monthly, local] = await Promise.all([
		getHighlightsWithinTimeWindow({
			temporalUnit: 'day',
			groupId: viewedGroup.id,
			parentTimeWindow: {
				year,
				month: month
			},
			includePerSpecies: false
		}),
		month
			? []
			: getHighlightsWithinTimeWindow({
					temporalUnit: 'month',
					groupId: viewedGroup.id,
					parentTimeWindow: {
						year,
						month: month
					},
					includePerSpecies: false
				}),
		year
			? getCondensedHighlightsAtTimePeriod(
					viewedGroup.id,
					`${year}-${String(month).padStart(2, '0') ?? '01'}-01`,
					month ? 'month' : 'year',
					1
				)
			: []
	]);
	return {
		sessionHighlights: daily,
		monthHighlights: monthly,
		localHighlights: local
	};
}

// Exported so call sites (e.g. `SummaryTotalsSection`'s `initialTabData` spread)
// can cast a server-prefetched `unknown` payload back to this tab's concrete
// `DataType` without reaching for `as unknown as` (#921).
export type SummaryHighlightsData = Awaited<
	ReturnType<typeof fetchSummaryHighlightsData>
>;

export const summaryHighlightsTab: TabConfig<
	SummaryHighlightsData,
	SummaryTabParams
> = {
	id: HIGHLIGHTS_TAB_ID,
	label: 'Highlights',
	dataFetcher: fetchSummaryHighlightsData,
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
